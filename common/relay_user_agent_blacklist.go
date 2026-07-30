package common

import (
	"fmt"
	"regexp"
	"strings"
	"sync/atomic"
)

type relayUserAgentBlacklistConfig struct {
	enabled  bool
	patterns []*regexp.Regexp
}

var relayUserAgentBlacklist atomic.Pointer[relayUserAgentBlacklistConfig]

// NormalizeRelayUserAgentBlacklist trims, removes empty and duplicate lines,
// and verifies that every remaining line is a Go RE2 regular expression.
func NormalizeRelayUserAgentBlacklist(value string) (string, error) {
	patterns := make([]string, 0)
	seen := make(map[string]struct{})
	for lineNumber, line := range strings.Split(value, "\n") {
		pattern := strings.TrimSpace(line)
		if pattern == "" {
			continue
		}
		if _, ok := seen[pattern]; ok {
			continue
		}
		if _, err := regexp.Compile(pattern); err != nil {
			return "", fmt.Errorf("invalid RelayUserAgentBlacklist regular expression on line %d: %w", lineNumber+1, err)
		}
		seen[pattern] = struct{}{}
		patterns = append(patterns, pattern)
	}
	return strings.Join(patterns, "\n"), nil
}

// SetRelayUserAgentBlacklistConfig replaces the complete immutable matcher
// snapshot so requests never compile regular expressions.
func SetRelayUserAgentBlacklistConfig(enabled bool, value string) (string, error) {
	normalized, err := NormalizeRelayUserAgentBlacklist(value)
	if err != nil {
		return "", err
	}

	patterns := make([]*regexp.Regexp, 0)
	if normalized != "" {
		for _, pattern := range strings.Split(normalized, "\n") {
			compiled, err := regexp.Compile(pattern)
			if err != nil {
				return "", err
			}
			patterns = append(patterns, compiled)
		}
	}
	relayUserAgentBlacklist.Store(&relayUserAgentBlacklistConfig{enabled: enabled, patterns: patterns})
	return normalized, nil
}

func IsRelayUserAgentBlacklisted(userAgent string) bool {
	_, matched := MatchRelayUserAgentBlacklist(userAgent)
	return matched
}

func MatchRelayUserAgentBlacklist(userAgent string) (string, bool) {
	config := relayUserAgentBlacklist.Load()
	if config == nil || !config.enabled {
		return "", false
	}
	for _, pattern := range config.patterns {
		if pattern.MatchString(userAgent) {
			return pattern.String(), true
		}
	}
	return "", false
}
