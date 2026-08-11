package codex

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLAlphaSearch(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeCodex,
			ChannelBaseUrl: "https://chatgpt.com",
		},
		RelayMode: relayconstant.RelayModeAlphaSearch,
	}

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://chatgpt.com/backend-api/codex/alpha/search", url)
}

func TestLegacyCodexIdentityChangesOnlyClientVersionFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	ctx.Request.Header.Set("Content-Type", "text/plain")

	info := &relaycommon.RelayInfo{
		IsStream: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeCodex,
			ApiKey:      `{"access_token":"access-token","account_id":"account-id"}`,
			ChannelOtherSettings: dto.ChannelOtherSettings{
				ClientIdentity: &dto.ClientIdentityConfig{
					Profile:  dto.ClientIdentityProfileCodexLegacy,
					Version:  "1.2.3",
					Platform: dto.ClientIdentityPlatformWindowsX64,
				},
			},
		},
	}
	headers := http.Header{}
	require.NoError(t, (&Adaptor{}).SetupRequestHeader(ctx, &headers, info))

	assert.Equal(t, "Bearer access-token", headers.Get("Authorization"))
	assert.Equal(t, "account-id", headers.Get("chatgpt-account-id"))
	assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
	assert.Equal(t, "codex_cli_rs", headers.Get("originator"))
	assert.Equal(t, "codex_cli_rs/1.2.3 (windows-x64)", headers.Get("User-Agent"))
	assert.Equal(t, "application/json", headers.Get("Content-Type"))
	assert.Equal(t, "text/event-stream", headers.Get("Accept"))
}

func convertResponsesForTest(t *testing.T, info *relaycommon.RelayInfo, req dto.OpenAIResponsesRequest) dto.OpenAIResponsesRequest {
	t.Helper()
	if info.ChannelMeta == nil {
		info.ChannelMeta = &relaycommon.ChannelMeta{}
	}
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	out, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(ctx, info, req)
	require.NoError(t, err)
	converted, ok := out.(dto.OpenAIResponsesRequest)
	require.True(t, ok, "expected OpenAIResponsesRequest value, got %T", out)
	return converted
}

func TestConvertOpenAIResponsesRequestChannelTestFillsCodexShape(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:     relayconstant.RelayModeResponses,
		IsChannelTest: true,
	}
	req := dto.OpenAIResponsesRequest{
		Model:  "gpt-6-astra",
		Input:  json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]`),
		Stream: lo.ToPtr(true),
	}
	converted := convertResponsesForTest(t, info, req)

	assert.JSONEq(t, `"auto"`, string(converted.ToolChoice))
	assert.JSONEq(t, `false`, string(converted.ParallelToolCalls))
	assert.JSONEq(t, `["reasoning.encrypted_content"]`, string(converted.Include))
	require.NotNil(t, converted.Reasoning)
	assert.Equal(t, "low", converted.Reasoning.Effort)
	assert.Equal(t, "none", converted.Reasoning.Summary)
	// prompt_cache_key must be a UUID string
	require.True(t, len(converted.PromptCacheKey) > 2, "prompt_cache_key should be set")
	key := strings.Trim(string(converted.PromptCacheKey), `"`)
	assert.Equal(t, 36, len(key), "prompt_cache_key should be a UUID: %s", key)
	// store must be forced false for the codex backend
	assert.JSONEq(t, `false`, string(converted.Store))
}

func TestConvertOpenAIResponsesRequestChannelTestKeepsProvidedFields(t *testing.T) {
	info := &relaycommon.RelayInfo{
		RelayMode:     relayconstant.RelayModeResponses,
		IsChannelTest: true,
	}
	req := dto.OpenAIResponsesRequest{
		Model:             "gpt-6-astra",
		Input:             json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]`),
		ToolChoice:        json.RawMessage(`"required"`),
		ParallelToolCalls: json.RawMessage(`true`),
		Include:           json.RawMessage(`["response.output_text"]`),
		Reasoning:         &dto.Reasoning{Effort: "medium", Summary: "concise"},
	}
	converted := convertResponsesForTest(t, info, req)

	// Channel-test shaping must not overwrite values the caller already set.
	assert.JSONEq(t, `"required"`, string(converted.ToolChoice))
	assert.JSONEq(t, `true`, string(converted.ParallelToolCalls))
	assert.JSONEq(t, `["response.output_text"]`, string(converted.Include))
	require.NotNil(t, converted.Reasoning)
	assert.Equal(t, "medium", converted.Reasoning.Effort)
}

func TestConvertOpenAIResponsesRequestRealRequestNotShaped(t *testing.T) {
	// IsChannelTest=false (normal user traffic): no fields injected.
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeResponses,
	}
	req := dto.OpenAIResponsesRequest{
		Model:  "gpt-6-astra",
		Input:  json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]`),
		Stream: lo.ToPtr(true),
	}
	converted := convertResponsesForTest(t, info, req)

	assert.Empty(t, converted.ToolChoice)
	assert.Empty(t, converted.ParallelToolCalls)
	assert.Empty(t, converted.Include)
	assert.Empty(t, converted.PromptCacheKey)
	assert.Nil(t, converted.Reasoning)
	assert.JSONEq(t, `false`, string(converted.Store))
}

func TestConvertOpenAIResponsesRequestCompactTestNotShaped(t *testing.T) {
	// Compaction tests return early and must not be shaped like full responses.
	info := &relaycommon.RelayInfo{
		RelayMode:     relayconstant.RelayModeResponsesCompact,
		IsChannelTest: true,
	}
	req := dto.OpenAIResponsesRequest{
		Model: "gpt-5.1-codex-compact",
		Input: json.RawMessage(`[{"role":"user","content":[{"type":"input_text","text":"hi"}]}]`),
	}
	converted := convertResponsesForTest(t, info, req)

	assert.Empty(t, converted.ToolChoice)
	assert.Empty(t, converted.ParallelToolCalls)
	assert.Empty(t, converted.Include)
	assert.Nil(t, converted.Reasoning)
}

// The Codex backend rejects these fields, so the adaptor clears them rather
// than forwarding what the client sent.
func TestConvertOpenAIResponsesRequestDropsPenalties(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeCodex},
		RelayMode:   relayconstant.RelayModeResponses,
	}

	converted, err := adaptor.ConvertOpenAIResponsesRequest(nil, info, dto.OpenAIResponsesRequest{
		Model:            "gpt-5-codex",
		Input:            json.RawMessage(`"hello"`),
		MaxOutputTokens:  lo.ToPtr(uint(128)),
		Temperature:      lo.ToPtr(1.0),
		FrequencyPenalty: json.RawMessage(`1.5`),
		PresencePenalty:  json.RawMessage(`1.5`),
	})
	require.NoError(t, err)

	request, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	assert.Nil(t, request.MaxOutputTokens)
	assert.Nil(t, request.Temperature)
	assert.Nil(t, request.FrequencyPenalty)
	assert.Nil(t, request.PresencePenalty)
}
