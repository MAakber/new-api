package openai

import (
	"bytes"
	"encoding/json"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

const codexCompatibilityEncryptedReasoningInclude = "reasoning.encrypted_content"

type codexCompatibilityClientMetadata struct {
	ThreadID       string `json:"thread_id"`
	TurnMetadata   string `json:"x-codex-turn-metadata"`
	SessionID      string `json:"session_id"`
	InstallationID string `json:"x-codex-installation-id"`
	TurnID         string `json:"turn_id"`
	WindowID       string `json:"x-codex-window-id"`
	RootTurnID     string `json:"root_turn_id"`
}

// applyCodexCompatibilityTestResponsesShape adds the small request profile
// expected by Codex-shaped Responses probes. It is intentionally called only
// for channel-test requests with the compatibility profile enabled.
func applyCodexCompatibilityTestResponsesShape(request *dto.OpenAIResponsesRequest, info *relaycommon.RelayInfo) error {
	if request == nil || info == nil {
		return nil
	}
	identity := info.EnsureCodexCompatibilityTestIdentity()
	if identity == nil {
		return nil
	}

	if !hasCodexJSONValue(request.Instructions) {
		request.Instructions = json.RawMessage(`"You are a helpful assistant."`)
	}
	if !hasCodexJSONValue(request.Text) {
		request.Text = json.RawMessage(`{"verbosity":"low"}`)
	}
	if !hasCodexJSONValue(request.ToolChoice) {
		request.ToolChoice = json.RawMessage(`"auto"`)
	}
	if !hasCodexJSONValue(request.ParallelToolCalls) {
		request.ParallelToolCalls = json.RawMessage(`false`)
	}
	if request.Reasoning == nil {
		request.Reasoning = &dto.Reasoning{
			Effort:  "low",
			Context: json.RawMessage(`"all_turns"`),
		}
	} else if !hasCodexJSONValue(request.Reasoning.Context) {
		request.Reasoning.Context = json.RawMessage(`"all_turns"`)
	}
	if !hasCodexJSONValue(request.PromptCacheKey) {
		request.PromptCacheKey = json.RawMessage(`"` + identity.PromptCacheKey + `"`)
	}
	request.Include = appendCodexCompatibilityInclude(request.Include)

	metadata := codexCompatibilityClientMetadata{
		ThreadID:       identity.ThreadID,
		TurnMetadata:   identity.TurnMetadata,
		SessionID:      identity.SessionID,
		InstallationID: identity.InstallationID,
		TurnID:         identity.TurnID,
		WindowID:       identity.WindowID,
		RootTurnID:     identity.RootTurnID,
	}
	clientMetadata, err := json.Marshal(metadata)
	if err != nil {
		return err
	}
	request.ClientMetadata = clientMetadata
	return nil
}

func appendCodexCompatibilityInclude(raw json.RawMessage) json.RawMessage {
	if !hasCodexJSONValue(raw) {
		return json.RawMessage(`["reasoning.encrypted_content"]`)
	}

	var values []any
	if err := json.Unmarshal(raw, &values); err != nil {
		return raw
	}
	for _, value := range values {
		if item, ok := value.(string); ok && item == codexCompatibilityEncryptedReasoningInclude {
			return raw
		}
	}
	values = append(values, codexCompatibilityEncryptedReasoningInclude)
	encoded, err := json.Marshal(values)
	if err != nil {
		return raw
	}
	return encoded
}

func hasCodexJSONValue(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) > 0 && !bytes.Equal(trimmed, []byte("null"))
}

func isCodexResponsesLiteModel(model string) bool {
	normalized := strings.ToLower(strings.TrimSpace(model))
	if !strings.HasPrefix(normalized, "gpt-5.6-") {
		return false
	}
	suffix := strings.TrimPrefix(normalized, "gpt-5.6-")
	return suffix == "sol" || suffix == "terra" || suffix == "luna"
}

func codexCompatibilityProfileModel(info *relaycommon.RelayInfo) string {
	if info == nil {
		return ""
	}
	if info.ChannelMeta != nil && strings.TrimSpace(info.UpstreamModelName) != "" {
		return info.UpstreamModelName
	}
	switch request := info.Request.(type) {
	case *dto.OpenAIResponsesRequest:
		return request.Model
	case *dto.OpenAIResponsesCompactionRequest:
		return request.Model
	default:
		return info.OriginModelName
	}
}

func deleteHeaderCaseInsensitive(headers map[string][]string, target string) {
	for name := range headers {
		if strings.EqualFold(name, target) {
			delete(headers, name)
		}
	}
}
