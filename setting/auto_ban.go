package setting

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"regexp"
	"sort"
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
)

const (
	AutoBanRuleSensitiveWords = "sensitive_words"
	AutoBanRuleUserAgent      = "user_agent"
	AutoBanRuleExcessiveIPs   = "excessive_ips"
	AutoBanRuleModelProbing   = "model_probing"

	AutoBanModeObserve = "observe"
	AutoBanModeEnforce = "enforce"
)

type AutoBanRuleConfig struct {
	Enabled            bool   `json:"enabled"`
	Mode               string `json:"mode"`
	Threshold          int    `json:"threshold"`
	WindowMinutes      int    `json:"window_minutes"`
	BanDurationMinutes int    `json:"ban_duration_minutes"`
	ResponseStatus     int    `json:"response_status"`
	ResponseMessage    string `json:"response_message"`
	ResponseCode       string `json:"response_code"`
}

type AutoBanConfig struct {
	Enabled        bool              `json:"enabled"`
	ExemptUserIDs  []int             `json:"exempt_user_ids"`
	ExemptGroups   []string          `json:"exempt_groups"`
	ExemptIPCIDRs  []string          `json:"exempt_ip_cidrs"`
	SensitiveWords AutoBanRuleConfig `json:"sensitive_words"`
	UserAgent      AutoBanRuleConfig `json:"user_agent"`
	ExcessiveIPs   AutoBanRuleConfig `json:"excessive_ips"`
	ModelProbing   AutoBanRuleConfig `json:"model_probing"`
}

type autoBanSnapshot struct {
	config       AutoBanConfig
	exemptUsers  map[int]struct{}
	exemptGroups map[string]struct{}
	exemptNets   []*net.IPNet
}

var autoBanConfig atomic.Pointer[autoBanSnapshot]

var autoBanResponseCodePattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+$`)

func defaultAutoBanRule(threshold int, windowMinutes int, banDurationMinutes int) AutoBanRuleConfig {
	return AutoBanRuleConfig{
		Enabled:            false,
		Mode:               AutoBanModeObserve,
		Threshold:          threshold,
		WindowMinutes:      windowMinutes,
		BanDurationMinutes: banDurationMinutes,
		ResponseStatus:     403,
		ResponseMessage:    "Account temporarily restricted by an automated security rule.",
		ResponseCode:       "account_temporarily_banned",
	}
}

func DefaultAutoBanConfig() AutoBanConfig {
	return AutoBanConfig{
		Enabled:        false,
		ExemptUserIDs:  []int{},
		ExemptGroups:   []string{},
		ExemptIPCIDRs:  []string{},
		SensitiveWords: defaultAutoBanRule(5, 24*60, 7*24*60),
		UserAgent:      defaultAutoBanRule(3, 10, 7*24*60),
		ExcessiveIPs:   defaultAutoBanRule(10, 24*60, 24*60),
		ModelProbing:   defaultAutoBanRule(20, 5, 7*24*60),
	}
}

func init() {
	_ = storeAutoBanConfig(DefaultAutoBanConfig())
}

func cloneAutoBanConfig(config AutoBanConfig) AutoBanConfig {
	config.ExemptUserIDs = append([]int(nil), config.ExemptUserIDs...)
	config.ExemptGroups = append([]string(nil), config.ExemptGroups...)
	config.ExemptIPCIDRs = append([]string(nil), config.ExemptIPCIDRs...)
	return config
}

func GetAutoBanConfig() AutoBanConfig {
	snapshot := autoBanConfig.Load()
	if snapshot == nil {
		return DefaultAutoBanConfig()
	}
	return cloneAutoBanConfig(snapshot.config)
}

func GetAutoBanRule(ruleType string) (AutoBanRuleConfig, bool) {
	config := GetAutoBanConfig()
	switch ruleType {
	case AutoBanRuleSensitiveWords:
		return config.SensitiveWords, true
	case AutoBanRuleUserAgent:
		return config.UserAgent, true
	case AutoBanRuleExcessiveIPs:
		return config.ExcessiveIPs, true
	case AutoBanRuleModelProbing:
		return config.ModelProbing, true
	default:
		return AutoBanRuleConfig{}, false
	}
}

func normalizeAutoBanRule(name string, rule *AutoBanRuleConfig) error {
	rule.Mode = strings.ToLower(strings.TrimSpace(rule.Mode))
	if rule.Mode == "" {
		rule.Mode = AutoBanModeObserve
	}
	if rule.Mode != AutoBanModeObserve && rule.Mode != AutoBanModeEnforce {
		return fmt.Errorf("%s mode must be observe or enforce", name)
	}
	if rule.Threshold < 1 || rule.Threshold > 100000 {
		return fmt.Errorf("%s threshold must be between 1 and 100000", name)
	}
	if rule.WindowMinutes < 1 || rule.WindowMinutes > 525600 {
		return fmt.Errorf("%s window_minutes must be between 1 and 525600", name)
	}
	if rule.BanDurationMinutes < 1 || rule.BanDurationMinutes > 525600 {
		return fmt.Errorf("%s ban_duration_minutes must be between 1 and 525600", name)
	}
	if rule.ResponseStatus < 400 || rule.ResponseStatus > 599 {
		return fmt.Errorf("%s response_status must be between 400 and 599", name)
	}
	rule.ResponseMessage = strings.TrimSpace(rule.ResponseMessage)
	if rule.ResponseMessage == "" || len(rule.ResponseMessage) > 500 {
		return fmt.Errorf("%s response_message must contain 1 to 500 characters", name)
	}
	rule.ResponseCode = strings.TrimSpace(rule.ResponseCode)
	if len(rule.ResponseCode) < 1 || len(rule.ResponseCode) > 64 || !autoBanResponseCodePattern.MatchString(rule.ResponseCode) {
		return fmt.Errorf("%s response_code must contain 1 to 64 letters, numbers, dots, underscores, or hyphens", name)
	}
	return nil
}

func normalizeAutoBanConfig(config AutoBanConfig) (AutoBanConfig, []*net.IPNet, error) {
	if err := normalizeAutoBanRule(AutoBanRuleSensitiveWords, &config.SensitiveWords); err != nil {
		return AutoBanConfig{}, nil, err
	}
	if err := normalizeAutoBanRule(AutoBanRuleUserAgent, &config.UserAgent); err != nil {
		return AutoBanConfig{}, nil, err
	}
	if err := normalizeAutoBanRule(AutoBanRuleExcessiveIPs, &config.ExcessiveIPs); err != nil {
		return AutoBanConfig{}, nil, err
	}
	if err := normalizeAutoBanRule(AutoBanRuleModelProbing, &config.ModelProbing); err != nil {
		return AutoBanConfig{}, nil, err
	}

	userSet := make(map[int]struct{})
	originalUserIDs := append([]int(nil), config.ExemptUserIDs...)
	config.ExemptUserIDs = make([]int, 0, len(originalUserIDs))
	for _, userID := range originalUserIDs {
		if userID <= 0 {
			return AutoBanConfig{}, nil, fmt.Errorf("exempt_user_ids must contain positive user IDs")
		}
		if _, exists := userSet[userID]; exists {
			continue
		}
		userSet[userID] = struct{}{}
		config.ExemptUserIDs = append(config.ExemptUserIDs, userID)
	}
	sort.Ints(config.ExemptUserIDs)

	groupSet := make(map[string]struct{})
	groups := make([]string, 0, len(config.ExemptGroups))
	for _, group := range config.ExemptGroups {
		group = strings.TrimSpace(group)
		if group == "" {
			continue
		}
		if len(group) > 64 {
			return AutoBanConfig{}, nil, fmt.Errorf("exempt group %q is too long", group)
		}
		if _, exists := groupSet[group]; exists {
			continue
		}
		groupSet[group] = struct{}{}
		groups = append(groups, group)
	}
	sort.Strings(groups)
	config.ExemptGroups = groups

	cidrSet := make(map[string]struct{})
	cidrs := make([]string, 0, len(config.ExemptIPCIDRs))
	networks := make([]*net.IPNet, 0, len(config.ExemptIPCIDRs))
	for _, rawCIDR := range config.ExemptIPCIDRs {
		rawCIDR = strings.TrimSpace(rawCIDR)
		if rawCIDR == "" {
			continue
		}
		if !strings.Contains(rawCIDR, "/") {
			ip := net.ParseIP(rawCIDR)
			if ip == nil {
				return AutoBanConfig{}, nil, fmt.Errorf("invalid exempt IP or CIDR %q", rawCIDR)
			}
			if ip.To4() != nil {
				rawCIDR = ip.String() + "/32"
			} else {
				rawCIDR = ip.String() + "/128"
			}
		}
		_, network, err := net.ParseCIDR(rawCIDR)
		if err != nil {
			return AutoBanConfig{}, nil, fmt.Errorf("invalid exempt IP or CIDR %q: %w", rawCIDR, err)
		}
		normalized := network.String()
		if _, exists := cidrSet[normalized]; exists {
			continue
		}
		cidrSet[normalized] = struct{}{}
		cidrs = append(cidrs, normalized)
		networks = append(networks, network)
	}
	sort.Strings(cidrs)
	config.ExemptIPCIDRs = cidrs
	return config, networks, nil
}

func decodeAutoBanConfig(value string) (AutoBanConfig, []*net.IPNet, error) {
	config := DefaultAutoBanConfig()
	decoder := json.NewDecoder(strings.NewReader(strings.TrimSpace(value)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&config); err != nil {
		return AutoBanConfig{}, nil, fmt.Errorf("invalid auto-ban configuration: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			err = fmt.Errorf("multiple JSON values are not allowed")
		}
		return AutoBanConfig{}, nil, fmt.Errorf("invalid auto-ban configuration: %w", err)
	}
	return normalizeAutoBanConfig(config)
}

func storeAutoBanConfig(config AutoBanConfig) error {
	normalized, networks, err := normalizeAutoBanConfig(config)
	if err != nil {
		return err
	}
	users := make(map[int]struct{}, len(normalized.ExemptUserIDs))
	for _, userID := range normalized.ExemptUserIDs {
		users[userID] = struct{}{}
	}
	groups := make(map[string]struct{}, len(normalized.ExemptGroups))
	for _, group := range normalized.ExemptGroups {
		groups[group] = struct{}{}
	}
	autoBanConfig.Store(&autoBanSnapshot{
		config:       normalized,
		exemptUsers:  users,
		exemptGroups: groups,
		exemptNets:   networks,
	})
	return nil
}

func ValidateAndNormalizeAutoBanConfigJSON(value string) (string, error) {
	config, _, err := decodeAutoBanConfig(value)
	if err != nil {
		return "", err
	}
	encoded, err := json.Marshal(config)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

func UpdateAutoBanConfigByJSONString(value string) error {
	config, _, err := decodeAutoBanConfig(value)
	if err != nil {
		return err
	}
	return storeAutoBanConfig(config)
}

func AutoBanConfig2JsonString() string {
	encoded, err := json.Marshal(GetAutoBanConfig())
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func IsAutoBanExempt(userID int, role int, group string, ip net.IP) bool {
	snapshot := autoBanConfig.Load()
	if snapshot == nil || !snapshot.config.Enabled {
		return true
	}
	if role >= common.RoleAdminUser {
		return true
	}
	if _, exists := snapshot.exemptUsers[userID]; exists {
		return true
	}
	if _, exists := snapshot.exemptGroups[group]; exists {
		return true
	}
	if ip != nil {
		for _, network := range snapshot.exemptNets {
			if network.Contains(ip) {
				return true
			}
		}
	}
	return false
}
