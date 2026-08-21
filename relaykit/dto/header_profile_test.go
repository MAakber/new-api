package dto

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestBuiltinCodexCLIHeaderProfileDoesNotUseExecIdentity(t *testing.T) {
	profile, exists := ResolveHeaderProfile("codex-cli", nil)
	require.True(t, exists)
	require.Contains(t, profile.Description, "显式选择")
	require.Equal(t, "codex-tui", profile.Headers["Originator"])
	require.True(t, strings.HasPrefix(profile.Headers["User-Agent"], "codex-tui/"))

	for key, value := range profile.Headers {
		normalizedKey := strings.ToLower(key)
		normalizedValue := strings.ToLower(value)
		require.NotContains(t, normalizedKey, "source")
		require.NotContains(t, normalizedValue, "codex_exec")
		require.NotContains(t, normalizedValue, "source=exec")
	}
}

func TestBuiltinCodexDesktopHeaderProfileUsesDesktopAppIdentity(t *testing.T) {
	profile, exists := ResolveHeaderProfile("codex-desktop", nil)
	require.True(t, exists)
	require.Contains(t, profile.Description, "Codex Desktop")
	require.Equal(t, BuiltinCodexDesktopUserAgent, profile.Headers["User-Agent"])
	require.Equal(t, BuiltinCodexDesktopOriginator, profile.Headers["Originator"])
	require.True(t, strings.HasPrefix(profile.Headers["User-Agent"], "Codex Desktop/"))
	require.NotContains(t, profile.Headers["User-Agent"], "codex-cli@")
	require.NotContains(t, strings.ToLower(profile.Headers["User-Agent"]), "codex_exec")
	require.NotContains(t, strings.ToLower(profile.Headers["User-Agent"]), "codex-tui")
}

func TestBuiltinAICodingCLIHeaderProfilesDoNotRequireAutomaticPassthrough(t *testing.T) {
	for _, profileID := range []string{"codex-cli", "codex-desktop", "claude-code", "gemini-cli"} {
		profile, exists := ResolveHeaderProfile(profileID, nil)
		require.True(t, exists, profileID)
		require.False(t, profile.PassthroughRequired, profileID)
		require.Contains(t, profile.Description, "显式选择", profileID)
	}
}

// The protocol-compatible templates replace the former channel-type driven
// header injection, so they must force pass_headers configuration.
func TestBuiltinDynamicHeaderProfilesRequirePassthrough(t *testing.T) {
	for _, profileID := range []string{HeaderProfileIDCodexCompatible, HeaderProfileIDClaudeCodeCompatible} {
		profile, exists := ResolveHeaderProfile(profileID, nil)
		require.True(t, exists, profileID)
		require.True(t, profile.PassthroughRequired, profileID)
		require.Equal(t, HeaderProfileCategoryDynamic, profile.Category, profileID)
		require.Contains(t, profile.Description, "pass_headers", profileID)
		// Dynamic templates must never carry credentials or transport headers.
		require.NotContains(t, profile.Headers, "Authorization")
		require.NotContains(t, profile.Headers, "Accept")
		require.NotContains(t, profile.Headers, "Content-Type")
	}
}

func TestBuiltinCodexCompatibleHeaderProfileKeepsProtocolMarkers(t *testing.T) {
	profile, exists := ResolveHeaderProfile(HeaderProfileIDCodexCompatible, nil)
	require.True(t, exists)
	require.Equal(t, "responses=experimental", profile.Headers["OpenAI-Beta"])
	require.Equal(t, BuiltinCodexCompatibleOriginator, profile.Headers["Originator"])
	require.True(t, strings.HasPrefix(profile.Headers["User-Agent"], "codex_cli_rs/"))
}

func TestBuiltinClaudeCodeCompatibleHeaderProfileKeepsProtocolMarkers(t *testing.T) {
	profile, exists := ResolveHeaderProfile(HeaderProfileIDClaudeCodeCompatible, nil)
	require.True(t, exists)
	require.Equal(t, "2023-06-01", profile.Headers["Anthropic-Version"])
	require.True(t, strings.HasPrefix(profile.Headers["User-Agent"], "claude-cli/"))
}

// Removed templates must no longer resolve, so a stale channel selection fails
// loudly instead of silently sending nothing.
func TestRemovedBuiltinHeaderProfilesNoLongerResolve(t *testing.T) {
	for _, profileID := range []string{"qwen-code", "droid", "agy", "postman-runtime"} {
		_, exists := ResolveHeaderProfile(profileID, nil)
		require.False(t, exists, profileID)
	}
}

func TestBuiltinClaudeCodeHeaderProfileDescriptionUsesClaudeCodeTemplateName(t *testing.T) {
	profile, exists := ResolveHeaderProfile("claude-code", nil)
	require.True(t, exists)
	require.Contains(t, profile.Description, "Claude Code 请求头透传模板")
	require.NotContains(t, profile.Description, "Claude CLI 请求头透传模板")
}

func TestBuiltinGeminiCLIHeaderProfileDescriptionUsesGeminiTemplateName(t *testing.T) {
	profile, exists := ResolveHeaderProfile("gemini-cli", nil)
	require.True(t, exists)
	require.Contains(t, profile.Description, "Gemini CLI npm latest")
	require.Contains(t, profile.Description, "Gemini CLI 请求头透传模板")
}

func TestBuiltinAICodingCLIHeaderProfilesDefaultToLatestVersionMeta(t *testing.T) {
	tests := []struct {
		profileID   string
		packageName string
	}{
		{profileID: "codex-cli", packageName: "@openai/codex"},
		{profileID: "claude-code", packageName: "@anthropic-ai/claude-code"},
		{profileID: "gemini-cli", packageName: "@google/gemini-cli"},
	}

	for _, test := range tests {
		t.Run(test.profileID, func(t *testing.T) {
			profile, exists := ResolveHeaderProfile(test.profileID, nil)
			require.True(t, exists)
			require.NotNil(t, profile.VersionMeta)
			require.Equal(t, test.profileID, profile.VersionMeta.BaseProfileID)
			require.Equal(t, test.packageName, profile.VersionMeta.PackageName)
			require.Equal(t, "npm", profile.VersionMeta.Source)
			require.Equal(t, HeaderProfileLatestVersion, profile.VersionMeta.Version)
			require.Equal(t, HeaderProfilePlatformMacOSX64, profile.VersionMeta.Platform)
		})
	}

	codexDesktop, exists := ResolveHeaderProfile("codex-desktop", nil)
	require.True(t, exists)
	require.Nil(t, codexDesktop.VersionMeta)

	// Dynamic templates track the npm release of their CLI counterpart, so they
	// carry version metadata that defaults to latest.
	dynamicPackages := map[string]string{
		HeaderProfileIDCodexCompatible:      "@openai/codex",
		HeaderProfileIDClaudeCodeCompatible: "@anthropic-ai/claude-code",
	}
	for profileID, packageName := range dynamicPackages {
		profile, exists := ResolveHeaderProfile(profileID, nil)
		require.True(t, exists, profileID)
		require.NotNil(t, profile.VersionMeta, profileID)
		require.Equal(t, packageName, profile.VersionMeta.PackageName, profileID)
		require.Equal(t, HeaderProfileLatestVersion, profile.VersionMeta.Version, profileID)
	}
}

// The dynamic templates must regenerate their own UA shape from the resolved
// npm version, not borrow the CLI template's format.
func TestDynamicHeaderProfilesResolveLatestNpmVersion(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		switch packageName {
		case "@openai/codex":
			return "0.200.0", true
		case "@anthropic-ai/claude-code":
			return "2.2.5", true
		}
		return "", false
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	codexHeaders, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{HeaderProfileIDCodexCompatible},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "codex_cli_rs/0.200.0", codexHeaders["User-Agent"])
	// Protocol markers must survive the version refresh.
	require.Equal(t, "responses=experimental", codexHeaders["OpenAI-Beta"])
	require.Equal(t, BuiltinCodexCompatibleOriginator, codexHeaders["Originator"])

	claudeHeaders, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{HeaderProfileIDClaudeCodeCompatible},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-cli/2.2.5 (external, cli)", claudeHeaders["User-Agent"])
	require.Equal(t, "2023-06-01", claudeHeaders["Anthropic-Version"])
}

// When npm data is unavailable the built-in snapshot must remain in place.
func TestDynamicHeaderProfilesKeepSnapshotWhenNpmUnavailable(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(string) (string, bool) { return "", false }
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{HeaderProfileIDCodexCompatible},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "codex_cli_rs/"+BuiltinCodexCompatibleVersion, headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesBuiltinLatestProfiles(t *testing.T) {
	latestVersions := map[string]string{
		"@openai/codex":             "0.200.0",
		"@anthropic-ai/claude-code": "2.2.0",
		"@google/gemini-cli":        "0.50.0",
	}
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		version, ok := latestVersions[packageName]
		return version, ok
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	tests := []struct {
		profileID     string
		expectedAgent string
	}{
		{
			profileID:     "codex-cli",
			expectedAgent: "codex-tui/0.200.0 (Mac OS 15.7.3; x86_64) ghostty/1.3.1 (codex-tui; 0.200.0)",
		},
		{
			profileID:     "claude-code",
			expectedAgent: "claude-cli/2.2.0 (external, sdk-cli)",
		},
		{
			profileID:     "gemini-cli",
			expectedAgent: "GeminiCLI/0.50.0/gemini-3.1-pro-preview (darwin; x64; terminal)",
		},
	}

	for _, test := range tests {
		t.Run(test.profileID, func(t *testing.T) {
			headers, profileID, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
				Enabled:            true,
				Mode:               HeaderProfileModeFixed,
				SelectedProfileIDs: []string{test.profileID},
			}, 0)
			require.NoError(t, err)
			require.Equal(t, test.profileID, profileID)
			require.Equal(t, test.expectedAgent, headers["User-Agent"])
		})
	}
}

func TestBuildAICodingCLIUserAgentSupportsKnownPlatforms(t *testing.T) {
	tests := []struct {
		name          string
		profileID     string
		version       string
		platform      string
		expectedAgent string
	}{
		{
			name:          "codex-linux",
			profileID:     "codex-cli",
			version:       "0.200.0",
			platform:      HeaderProfilePlatformLinuxX64,
			expectedAgent: "codex-tui/0.200.0 (Linux; x86_64) ghostty/1.3.1 (codex-tui; 0.200.0)",
		},
		{
			name:          "codex-macos-arm64",
			profileID:     "codex-cli",
			version:       "0.200.0",
			platform:      HeaderProfilePlatformMacOSArm64,
			expectedAgent: "codex-tui/0.200.0 (Mac OS 15.7.3; aarch64) ghostty/1.3.1 (codex-tui; 0.200.0)",
		},

		{
			name:          "gemini-windows",
			profileID:     "gemini-cli",
			version:       "0.50.0",
			platform:      HeaderProfilePlatformWindowsX64,
			expectedAgent: "GeminiCLI/0.50.0/gemini-3.1-pro-preview (win32; x64; terminal)",
		},
		{
			name:          "gemini-windows-arm64",
			profileID:     "gemini-cli",
			version:       "0.50.0",
			platform:      HeaderProfilePlatformWindowsArm64,
			expectedAgent: "GeminiCLI/0.50.0/gemini-3.1-pro-preview (win32; arm64; terminal)",
		},

		{
			name:          "claude-platform-independent",
			profileID:     "claude-code",
			version:       "2.2.0",
			platform:      HeaderProfilePlatformWindowsX64,
			expectedAgent: "claude-cli/2.2.0 (external, sdk-cli)",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			require.Equal(t, test.expectedAgent, buildAICodingCLIUserAgent(test.profileID, test.version, test.platform))
		})
	}
}

func TestResolveHeaderProfileStrategyHeadersResolvesLatestVersionMeta(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@openai/codex", packageName)
		return "0.200.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, profileID, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"codex-cli@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "codex-cli@latest",
				Headers: map[string]string{
					"User-Agent": "codex-tui/0.142.4 (Mac OS 15.7.3; x86_64) ghostty/1.3.1 (codex-tui; 0.142.4)",
					"Originator": "codex-tui",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "codex-cli",
					PackageName:   "@openai/codex",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
					Platform:      HeaderProfilePlatformLinuxX64,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "codex-cli@latest", profileID)
	require.Equal(t, "codex-tui/0.200.0 (Linux; x86_64) ghostty/1.3.1 (codex-tui; 0.200.0)", headers["User-Agent"])
	require.Equal(t, "codex-tui", headers["Originator"])
}

func TestResolveHeaderProfileStrategyHeadersUsesVersionMetaPlatform(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@google/gemini-cli", packageName)
		return "0.50.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, profileID, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"gemini-cli@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "gemini-cli@latest",
				Headers: map[string]string{
					"User-Agent": "GeminiCLI/0.49.0/gemini-3.1-pro-preview (darwin; x64; terminal)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "gemini-cli",
					PackageName:   "@google/gemini-cli",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
					Platform:      HeaderProfilePlatformWindowsArm64,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "gemini-cli@latest", profileID)
	require.Equal(t, "GeminiCLI/0.50.0/gemini-3.1-pro-preview (win32; arm64; terminal)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesBuiltinLatestWithoutSnapshot(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@openai/codex", packageName)
		return "0.200.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, profileID, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"codex-cli@latest"},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "codex-cli@latest", profileID)
	require.Equal(t, "codex-tui/0.200.0 (Mac OS 15.7.3; x86_64) ghostty/1.3.1 (codex-tui; 0.200.0)", headers["User-Agent"])
	require.Equal(t, BuiltinCodexCLIOriginator, headers["Originator"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesBuiltinPinnedVersionWithoutSnapshot(t *testing.T) {
	headers, profileID, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"claude-code@2.2.0"},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-code@2.2.0", profileID)
	require.Equal(t, "claude-cli/2.2.0 (external, sdk-cli)", headers["User-Agent"])
}

func TestResolveHeaderProfileRejectsInvalidPinnedVersion(t *testing.T) {
	_, exists := ResolveHeaderProfile("claude-code@2.2.0\nInjected", nil)
	require.False(t, exists)

	_, exists = ResolveHeaderProfile("claude-code@latest", nil)
	require.True(t, exists)
}

func TestResolveHeaderProfileStrategyHeadersKeepsSnapshotWhenLatestUnavailable(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		return "", false
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"claude-code@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "claude-code@latest",
				Headers: map[string]string{
					"User-Agent": "claude-cli/2.1.197 (external, sdk-cli)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "claude-code",
					PackageName:   "@anthropic-ai/claude-code",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-cli/2.1.197 (external, sdk-cli)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersKeepsSnapshotWhenLatestIsInvalid(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		return "2.2.0\nInjected", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"claude-code@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "claude-code@latest",
				Headers: map[string]string{
					"User-Agent": "claude-cli/2.1.197 (external, sdk-cli)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "claude-code",
					PackageName:   "@anthropic-ai/claude-code",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-cli/2.1.197 (external, sdk-cli)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersTreatsLegacyFallbackLatestAsDynamic(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@anthropic-ai/claude-code", packageName)
		return "2.2.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"claude-code@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "claude-code@latest",
				Headers: map[string]string{
					"User-Agent": "claude-cli/2.1.197 (external, sdk-cli)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "claude-code",
					PackageName:   "@anthropic-ai/claude-code",
					Source:        "fallback",
					Version:       HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-cli/2.2.0 (external, sdk-cli)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesLatestWithoutPackageName(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@google/gemini-cli", packageName)
		return "0.50.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"gemini-cli@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "gemini-cli@latest",
				Headers: map[string]string{
					"User-Agent": "GeminiCLI/0.49.0/gemini-3.1-pro-preview (darwin; x64; terminal)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "gemini-cli",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "GeminiCLI/0.50.0/gemini-3.1-pro-preview (darwin; x64; terminal)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesLatestWithOnlyVersionMeta(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@google/gemini-cli", packageName)
		return "0.50.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"gemini-cli@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "gemini-cli@latest",
				Headers: map[string]string{
					"User-Agent": "GeminiCLI/0.49.0/gemini-3.1-pro-preview (darwin; x64; terminal)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					BaseProfileID: "gemini-cli",
					Source:        "npm",
					Version:       HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "GeminiCLI/0.50.0/gemini-3.1-pro-preview (darwin; x64; terminal)", headers["User-Agent"])
}

func TestResolveHeaderProfileStrategyHeadersResolvesLatestWithoutBaseProfileID(t *testing.T) {
	previousResolver := ResolveNpmCLILatestVersion
	ResolveNpmCLILatestVersion = func(packageName string) (string, bool) {
		require.Equal(t, "@anthropic-ai/claude-code", packageName)
		return "2.2.0", true
	}
	defer func() {
		ResolveNpmCLILatestVersion = previousResolver
	}()

	headers, _, err := ResolveHeaderProfileStrategyHeaders(&HeaderProfileStrategy{
		Enabled:            true,
		Mode:               HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"claude-code@latest"},
		Profiles: []HeaderProfile{
			{
				ID: "claude-code@latest",
				Headers: map[string]string{
					"User-Agent": "claude-cli/2.1.197 (external, sdk-cli)",
				},
				VersionMeta: &HeaderProfileVersionMeta{
					PackageName: "@anthropic-ai/claude-code",
					Source:      "npm",
					Version:     HeaderProfileLatestVersion,
				},
			},
		},
	}, 0)
	require.NoError(t, err)
	require.Equal(t, "claude-cli/2.2.0 (external, sdk-cli)", headers["User-Agent"])
}
