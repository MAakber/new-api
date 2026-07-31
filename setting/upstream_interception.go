package setting

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"sync/atomic"
	"unicode/utf8"
)

const (
	UpstreamInterceptionOptionKey = "UpstreamInterceptionConfig"

	UpstreamInterceptionActionRemove = "remove"
	UpstreamInterceptionActionBlock  = "block"

	UpstreamInterceptionRuleKeyword = "keyword"
	UpstreamInterceptionRuleRegex   = "regex"

	UpstreamInterceptionWindowRunes = 512

	maxUpstreamInterceptionRules        = 100
	maxUpstreamInterceptionNameRunes    = 64
	maxUpstreamInterceptionPatternRunes = 512
	maxUpstreamInterceptionMessageRunes = 500
	maxUpstreamInterceptionCodeRunes    = 64
)

var upstreamInterceptionErrorCodePattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]+$`)

type UpstreamInterceptionRule struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	Expression string `json:"expression"`
	Enabled    bool   `json:"enabled"`
}

type UpstreamInterceptionConfig struct {
	Enabled            bool                       `json:"enabled"`
	Action             string                     `json:"action"`
	RetryOnBlock       bool                       `json:"retry_on_block"`
	ErrorStatus        int                        `json:"error_status"`
	ErrorCode          string                     `json:"error_code"`
	ErrorMessage       string                     `json:"error_message"`
	ExcludedChannelIDs []int                      `json:"excluded_channel_ids"`
	Rules              []UpstreamInterceptionRule `json:"rules"`
}

type UpstreamInterceptionMatch struct {
	Start    int
	End      int
	RuleName string
}

type compiledUpstreamInterceptionRule struct {
	name    string
	matcher *regexp.Regexp
}

type UpstreamInterceptionSnapshot struct {
	config   UpstreamInterceptionConfig
	rules    []compiledUpstreamInterceptionRule
	excluded map[int]struct{}
}

var upstreamInterceptionSnapshot atomic.Pointer[UpstreamInterceptionSnapshot]

func init() {
	_, _ = SetUpstreamInterceptionConfig(DefaultUpstreamInterceptionConfigJSON())
}

func DefaultUpstreamInterceptionConfig() UpstreamInterceptionConfig {
	return UpstreamInterceptionConfig{
		Action:       UpstreamInterceptionActionRemove,
		ErrorStatus:  502,
		ErrorCode:    "upstream_response_intercepted",
		ErrorMessage: "上游响应被内容策略拦截",
		Rules:        []UpstreamInterceptionRule{},
	}
}

func DefaultUpstreamInterceptionConfigJSON() string {
	data, _ := json.Marshal(DefaultUpstreamInterceptionConfig())
	return string(data)
}

func ValidateAndNormalizeUpstreamInterceptionConfigJSON(value string) (string, error) {
	config, snapshot, err := compileUpstreamInterceptionConfig(value)
	if err != nil {
		return "", err
	}
	_ = snapshot
	data, err := json.Marshal(config)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func SetUpstreamInterceptionConfig(value string) (string, error) {
	config, snapshot, err := compileUpstreamInterceptionConfig(value)
	if err != nil {
		return "", err
	}
	data, err := json.Marshal(config)
	if err != nil {
		return "", err
	}
	upstreamInterceptionSnapshot.Store(snapshot)
	return string(data), nil
}

func GetUpstreamInterceptionSnapshot(channelID int) *UpstreamInterceptionSnapshot {
	snapshot := upstreamInterceptionSnapshot.Load()
	if snapshot == nil || !snapshot.config.Enabled || len(snapshot.rules) == 0 {
		return nil
	}
	if _, excluded := snapshot.excluded[channelID]; excluded {
		return nil
	}
	return snapshot
}

func (s *UpstreamInterceptionSnapshot) Config() UpstreamInterceptionConfig {
	if s == nil {
		return UpstreamInterceptionConfig{}
	}
	config := s.config
	config.ExcludedChannelIDs = append([]int(nil), config.ExcludedChannelIDs...)
	config.Rules = append([]UpstreamInterceptionRule(nil), config.Rules...)
	return config
}

func (s *UpstreamInterceptionSnapshot) FindMatches(text string) []UpstreamInterceptionMatch {
	if s == nil || text == "" {
		return nil
	}
	matches := make([]UpstreamInterceptionMatch, 0)
	for _, rule := range s.rules {
		for _, location := range rule.matcher.FindAllStringIndex(text, -1) {
			if location[0] == location[1] {
				continue
			}
			matches = append(matches, UpstreamInterceptionMatch{Start: location[0], End: location[1], RuleName: rule.name})
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		if matches[i].Start != matches[j].Start {
			return matches[i].Start < matches[j].Start
		}
		return matches[i].End > matches[j].End
	})
	return matches
}

func compileUpstreamInterceptionConfig(value string) (UpstreamInterceptionConfig, *UpstreamInterceptionSnapshot, error) {
	config := DefaultUpstreamInterceptionConfig()
	if strings.TrimSpace(value) != "" {
		if err := json.Unmarshal([]byte(value), &config); err != nil {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("invalid upstream interception configuration: %w", err)
		}
	}
	config.Action = strings.TrimSpace(config.Action)
	if config.Action != UpstreamInterceptionActionRemove && config.Action != UpstreamInterceptionActionBlock {
		return UpstreamInterceptionConfig{}, nil, errors.New("upstream interception action must be remove or block")
	}
	if config.ErrorStatus < 400 || config.ErrorStatus > 599 {
		return UpstreamInterceptionConfig{}, nil, errors.New("upstream interception error status must be between 400 and 599")
	}
	config.ErrorCode = strings.TrimSpace(config.ErrorCode)
	if config.ErrorCode == "" || utf8.RuneCountInString(config.ErrorCode) > maxUpstreamInterceptionCodeRunes || !upstreamInterceptionErrorCodePattern.MatchString(config.ErrorCode) {
		return UpstreamInterceptionConfig{}, nil, errors.New("invalid upstream interception error code")
	}
	config.ErrorMessage = strings.TrimSpace(config.ErrorMessage)
	if config.ErrorMessage == "" || utf8.RuneCountInString(config.ErrorMessage) > maxUpstreamInterceptionMessageRunes {
		return UpstreamInterceptionConfig{}, nil, errors.New("invalid upstream interception error message")
	}
	if len(config.Rules) > maxUpstreamInterceptionRules {
		return UpstreamInterceptionConfig{}, nil, fmt.Errorf("upstream interception supports at most %d rules", maxUpstreamInterceptionRules)
	}

	seenNames := make(map[string]struct{}, len(config.Rules))
	compiled := make([]compiledUpstreamInterceptionRule, 0, len(config.Rules))
	for index := range config.Rules {
		rule := &config.Rules[index]
		rule.Name = strings.TrimSpace(rule.Name)
		rule.Type = strings.TrimSpace(rule.Type)
		rule.Expression = strings.TrimSpace(rule.Expression)
		if rule.Name == "" || utf8.RuneCountInString(rule.Name) > maxUpstreamInterceptionNameRunes {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("invalid upstream interception rule name at index %d", index)
		}
		if _, exists := seenNames[rule.Name]; exists {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("duplicate upstream interception rule name %q", rule.Name)
		}
		seenNames[rule.Name] = struct{}{}
		if rule.Type != UpstreamInterceptionRuleKeyword && rule.Type != UpstreamInterceptionRuleRegex {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("invalid upstream interception rule type for %q", rule.Name)
		}
		if rule.Expression == "" || utf8.RuneCountInString(rule.Expression) > maxUpstreamInterceptionPatternRunes {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("invalid upstream interception expression for %q", rule.Name)
		}
		if !rule.Enabled {
			continue
		}
		expression := rule.Expression
		if rule.Type == UpstreamInterceptionRuleKeyword {
			expression = regexp.QuoteMeta(expression)
		}
		matcher, err := regexp.Compile("(?i:" + expression + ")")
		if err != nil {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("invalid upstream interception expression for %q: %w", rule.Name, err)
		}
		if matcher.MatchString("") {
			return UpstreamInterceptionConfig{}, nil, fmt.Errorf("upstream interception rule %q must not match empty text", rule.Name)
		}
		compiled = append(compiled, compiledUpstreamInterceptionRule{name: rule.Name, matcher: matcher})
	}

	excluded := make(map[int]struct{}, len(config.ExcludedChannelIDs))
	normalizedExcluded := make([]int, 0, len(config.ExcludedChannelIDs))
	for _, channelID := range config.ExcludedChannelIDs {
		if channelID <= 0 {
			return UpstreamInterceptionConfig{}, nil, errors.New("upstream interception excluded channel IDs must be positive")
		}
		if _, exists := excluded[channelID]; exists {
			continue
		}
		excluded[channelID] = struct{}{}
		normalizedExcluded = append(normalizedExcluded, channelID)
	}
	sort.Ints(normalizedExcluded)
	config.ExcludedChannelIDs = normalizedExcluded
	return config, &UpstreamInterceptionSnapshot{config: config, rules: compiled, excluded: excluded}, nil
}
