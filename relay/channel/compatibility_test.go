package channel

import (
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestApplyCompatibilityHeaders(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		isStream    bool
		assertions  func(t *testing.T, headers http.Header)
	}{
		{
			name:        "Codex",
			channelType: constant.ChannelTypeCodexCompatibility,
			isStream:    true,
			assertions: func(t *testing.T, headers http.Header) {
				assert.Equal(t, "Bearer test-key", headers.Get("Authorization"))
				assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
				assert.Equal(t, "codex_cli_rs", headers.Get("Originator"))
				assert.Equal(t, "codex_cli_rs/0.146.0", headers.Get("User-Agent"))
				assert.Equal(t, "application/json", headers.Get("Content-Type"))
				assert.Equal(t, "text/event-stream", headers.Get("Accept"))
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := http.Header{
				"X-Api-Key":        []string{"discard"},
				"X-Stainless-Lang": []string{"node"},
				"Sec-Fetch-Mode":   []string{"cors"},
			}

			ApplyCompatibilityHeaders(test.channelType, headers, "test-key", test.isStream)

			test.assertions(t, headers)
		})
	}
}

func TestApplyLightweightClientIdentityUsesOnlyVerifiedFields(t *testing.T) {
	tests := []struct {
		name     string
		profile  string
		version  string
		platform string
		wantUA   string
	}{
		{
			name:     "Codex CLI",
			profile:  dto.ClientIdentityProfileCodexCLI,
			version:  "0.147.0",
			platform: dto.ClientIdentityPlatformLinuxX64,
			wantUA:   "codex_cli_rs/0.147.0 (linux-x64)",
		},
		{
			name:     "Claude CLI",
			profile:  dto.ClientIdentityProfileClaudeCLI,
			version:  "2.1.224",
			platform: dto.ClientIdentityPlatformMacOSArm64,
			wantUA:   "claude-cli/2.1.224 (external, cli; macos-arm64)",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := http.Header{}
			ApplyLightweightClientIdentity(headers, &dto.ClientIdentityConfig{
				Profile:  test.profile,
				Version:  test.version,
				Platform: test.platform,
			})
			assert.Equal(t, test.wantUA, headers.Get("User-Agent"))
			assert.Empty(t, headers.Get("Authorization"))
			assert.Empty(t, headers.Get("Anthropic-Version"))
		})
	}
}

func TestApplyClaudeCodeCompatibilityHeaders(t *testing.T) {
	const sessionID = "123e4567-e89b-12d3-a456-426614174000"

	tests := []struct {
		name       string
		isStream   bool
		wantAccept string
	}{
		{name: "stream", isStream: true, wantAccept: "text/event-stream"},
		{name: "non-stream", isStream: false, wantAccept: "application/json"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := http.Header{
				"authorization":            []string{"discard"},
				"proxy-authorization":      []string{"discard"},
				"cookie":                   []string{"discard"},
				"user-agent":               []string{"discard"},
				"anthropic-version":        []string{"discard"},
				"content-type":             []string{"discard"},
				"accept":                   []string{"discard"},
				"x-api-key":                []string{"discard"},
				"x-goog-api-key":           []string{"discard"},
				"x-app":                    []string{"discard"},
				"x-claude-code-session-id": []string{"client-supplied"},
				"X-Stainless-Lang":         []string{"node"},
				"X-Stainless-Os":           []string{"linux"},
				"anthropic-dangerous-direct-browser-access": []string{"true"},
				"accept-language": []string{"en-US"},
				"sec-fetch-mode":  []string{"cors"},
				"Anthropic-Beta":  []string{"interleaved-thinking-2025-05-14"},
				"X-Safe-Static":   []string{"survives"},
			}

			ApplyClaudeCodeCompatibilityHeaders(headers, "test-key", test.isStream, sessionID, true)
			ApplyClaudeCodeCompatibilityHeaders(headers, "test-key", test.isStream, sessionID, true)

			require.Equal(t, "Bearer test-key", headers.Get("Authorization"))
			require.Equal(t, "test-key", headers.Get("X-Api-Key"))
			require.Equal(t, "claude-cli/2.1.214 (external, cli)", headers.Get("User-Agent"))
			require.Equal(t, "cli", headers.Get("X-App"))
			require.Equal(t, "2023-06-01", headers.Get("Anthropic-Version"))
			require.Equal(t, "application/json", headers.Get("Content-Type"))
			require.Equal(t, test.wantAccept, headers.Get("Accept"))
			require.Equal(t, sessionID, headers.Get("X-Claude-Code-Session-Id"))
			require.Equal(t, "interleaved-thinking-2025-05-14", headers.Get("Anthropic-Beta"))
			require.Equal(t, "survives", headers.Get("X-Safe-Static"))
			require.Equal(t, "node", headers.Get("X-Stainless-Lang"))
			require.Equal(t, "linux", headers.Get("X-Stainless-Os"))
			require.Regexp(t, `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, headers.Get("X-Client-Request-Id"))
			// 客户端伪造的受管头被丢弃
			require.Empty(t, headers.Get("Proxy-Authorization"))
			require.Empty(t, headers.Get("Cookie"))
			require.Empty(t, headers.Get("Anthropic-Dangerous-Direct-Browser-Access"))
			require.Empty(t, headers.Get("Accept-Language"))
			require.Empty(t, headers.Get("Sec-Fetch-Mode"))
		})
	}

	headers := http.Header{
		"X-Claude-Code-Session-Id": []string{"client-supplied"},
	}
	ApplyClaudeCodeCompatibilityHeaders(headers, "test-key", false, "", true)
	assert.Empty(t, headers.Get("X-Claude-Code-Session-Id"))
}

func TestApplyClaudeCodeCompatibilityHeadersFetchModelsSingleCredential(t *testing.T) {
	headers := http.Header{}
	// GET /v1/models：按协议只携带单个凭证头（Authorization），不设置 x-api-key。
	ApplyClaudeCodeCompatibilityHeaders(headers, "test-key", false, "", false)
	assert.Equal(t, "Bearer test-key", headers.Get("Authorization"))
	assert.Empty(t, headers.Get("X-Api-Key"))
	assert.Equal(t, "claude-cli/2.1.214 (external, cli)", headers.Get("User-Agent"))
}

func TestApplyClaudeCodeCompatibilityHeadersContext1MBetaToken(t *testing.T) {
	tests := []struct {
		name          string
		enabled       bool
		initialHeader []string
		wantHeader    string
	}{
		{
			name:       "enabled adds token",
			enabled:    true,
			wantHeader: claudeCodeContext1MBetaToken,
		},
		{
			name:          "enabled preserves existing tokens and removes duplicates",
			enabled:       true,
			initialHeader: []string{"interleaved-thinking-2025-05-14, context-1m-2025-08-07", "context-1m-2025-08-07, prompt-caching-2024-07-31"},
			wantHeader:    "interleaved-thinking-2025-05-14, context-1m-2025-08-07, prompt-caching-2024-07-31",
		},
		{
			name:          "disabled does not add token",
			initialHeader: []string{"interleaved-thinking-2025-05-14"},
			wantHeader:    "interleaved-thinking-2025-05-14",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			headers := http.Header{}
			if tt.initialHeader != nil {
				headers["Anthropic-Beta"] = tt.initialHeader
			}
			config := &dto.ClientIdentityConfig{
				Profile:          dto.ClientIdentityProfileClaudeCode,
				Context1MEnabled: tt.enabled,
			}

			ApplyClaudeCodeCompatibilityHeadersWithIdentity(headers, "test-key", false, "", true, config)
			ApplyClaudeCodeCompatibilityHeadersWithIdentity(headers, "test-key", false, "", true, config)

			assert.Equal(t, tt.wantHeader, headers.Get("Anthropic-Beta"))
			wantContextTokenCount := 0
			if tt.enabled {
				wantContextTokenCount = 1
			}
			assert.Equal(t, wantContextTokenCount, strings.Count(headers.Get("Anthropic-Beta"), claudeCodeContext1MBetaToken))
		})
	}
}

func TestConfiguredClientIdentityAppliesVersionAndPlatformWithoutReplacingCredentials(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		config      *dto.ClientIdentityConfig
		apply       func(http.Header, *dto.ClientIdentityConfig)
		assertions  func(*testing.T, http.Header)
	}{
		{
			name:        "codex compatibility profile",
			channelType: constant.ChannelTypeCodexCompatibility,
			config: &dto.ClientIdentityConfig{
				Profile:  dto.ClientIdentityProfileCodexCompatibility,
				Version:  "1.2.3",
				Platform: dto.ClientIdentityPlatformLinuxX64,
			},
			apply: func(headers http.Header, config *dto.ClientIdentityConfig) {
				ApplyCompatibilityHeadersWithClientIdentity(constant.ChannelTypeCodexCompatibility, headers, "codex-key", true, "", config)
			},
			assertions: func(t *testing.T, headers http.Header) {
				assert.Equal(t, "Bearer codex-key", headers.Get("Authorization"))
				assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
				assert.Equal(t, "codex_cli_rs", headers.Get("Originator"))
				assert.Equal(t, "codex_cli_rs/1.2.3 (linux-x64)", headers.Get("User-Agent"))
				assert.Equal(t, "text/event-stream", headers.Get("Accept"))
			},
		},
		{
			name:        "claude code profile",
			channelType: constant.ChannelTypeClaudeCode,
			config: &dto.ClientIdentityConfig{
				Profile:  dto.ClientIdentityProfileClaudeCode,
				Version:  "2.1.214",
				Platform: dto.ClientIdentityPlatformMacOSArm64,
			},
			apply: func(headers http.Header, config *dto.ClientIdentityConfig) {
				ApplyClaudeCodeCompatibilityHeadersWithIdentity(headers, "claude-key", true, "session-id", true, config)
			},
			assertions: func(t *testing.T, headers http.Header) {
				assert.Equal(t, "Bearer claude-key", headers.Get("Authorization"))
				assert.Equal(t, "claude-key", headers.Get("X-Api-Key"))
				assert.Equal(t, "claude-cli/2.1.214 (external, cli; macos-arm64)", headers.Get("User-Agent"))
				assert.Equal(t, "cli", headers.Get("X-App"))
				assert.Equal(t, "session-id", headers.Get("X-Claude-Code-Session-Id"))
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			headers := http.Header{}
			test.apply(headers, test.config)
			test.assertions(t, headers)
		})
	}
}

func TestConfiguredClientIdentityDefaultsDoNotReplaceHeaderOverride(t *testing.T) {
	config := &dto.ClientIdentityConfig{
		Profile:  dto.ClientIdentityProfileCodexCompatibility,
		Version:  "1.2.3",
		Platform: dto.ClientIdentityPlatformLinuxX64,
	}
	headers := http.Header{}

	ApplyCompatibilityHeadersWithClientIdentity(
		constant.ChannelTypeCodexCompatibility,
		headers,
		"codex-key",
		false,
		"",
		config,
	)
	headers.Set("User-Agent", "header-override")
	headers.Set("Authorization", "override-authorization")

	assert.Equal(t, "header-override", headers.Get("User-Agent"))
	assert.Equal(t, "override-authorization", headers.Get("Authorization"))
}
