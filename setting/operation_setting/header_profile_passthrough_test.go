package operation_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// The frontend "快捷预设" buttons in ParamOverrideEditorDialog insert exactly
// these header sets. If the server-side requirement ever grows beyond what a
// preset inserts, a user would click the matching preset and still be blocked
// on save, so the two must stay in lockstep.
var frontendQuickPresetHeaders = map[string][]string{
	"codex-compatible": {
		"Originator",
		"Session_id",
		"Session-Id",
		"Thread-Id",
		"X-Codex-Beta-Features",
		"X-Codex-Turn-Metadata",
		"X-Codex-Window-Id",
		"X-Client-Request-Id",
	},
	"claude-code-compatible": {
		"X-Claude-Code-Session-Id",
		"X-Stainless-Arch",
		"X-Stainless-Lang",
		"X-Stainless-OS",
		"X-Stainless-Package-Version",
		"X-Stainless-Retry-Count",
		"X-Stainless-Runtime",
		"X-Stainless-Runtime-Version",
		"X-Stainless-Timeout",
		"X-App",
		"Anthropic-Beta",
		"Anthropic-Dangerous-Direct-Browser-Access",
		"Anthropic-Version",
	},
}

func lowerSet(values []string) map[string]struct{} {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[strings.ToLower(strings.TrimSpace(value))] = struct{}{}
	}
	return set
}

func TestDynamicHeaderProfileRequirementsAreSatisfiedByQuickPresets(t *testing.T) {
	for profileID, presetHeaders := range frontendQuickPresetHeaders {
		required, exists := HeaderProfilePassThroughHeaders[profileID]
		require.True(t, exists, profileID)

		provided := lowerSet(presetHeaders)
		missing := make([]string, 0)
		for _, header := range required {
			if _, ok := provided[strings.ToLower(strings.TrimSpace(header))]; !ok {
				missing = append(missing, header)
			}
		}
		require.Emptyf(
			t,
			missing,
			"%s requires headers the frontend quick preset does not add: %v",
			profileID,
			missing,
		)
	}
}

// A template must never require a credential or transport header, because the
// relay owns those and strips them from profiles.
func TestHeaderProfilePassThroughHeadersNeverRequireOwnedHeaders(t *testing.T) {
	owned := lowerSet([]string{
		"authorization",
		"x-api-key",
		"host",
		"content-length",
		"transfer-encoding",
		"cookie",
	})

	for profileID, headers := range HeaderProfilePassThroughHeaders {
		for _, header := range headers {
			_, isOwned := owned[strings.ToLower(strings.TrimSpace(header))]
			require.Falsef(t, isOwned, "%s must not require %s", profileID, header)
		}
	}
}
