package openai

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCodexCompatibilityBuildsPiCompatibleResponsesRequest(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	info := &relaycommon.RelayInfo{
		IsStream: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeCodexCompatibility,
			ApiKey:      "test-key",
		},
	}
	adaptor := &Adaptor{}
	adaptor.Init(info)

	headers := http.Header{}
	require.NoError(t, adaptor.SetupRequestHeader(c, &headers, info))
	assert.Equal(t, "Bearer test-key", headers.Get("Authorization"))
	assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
	assert.Equal(t, "codex_cli_rs", headers.Get("Originator"))
	assert.Equal(t, "text/event-stream", headers.Get("Accept"))

	maxOutputTokens := uint(4096)
	converted, err := adaptor.ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{
		Model:           "gpt-5-codex",
		MaxOutputTokens: &maxOutputTokens,
	})
	require.NoError(t, err)
	request, ok := converted.(dto.OpenAIResponsesRequest)
	require.True(t, ok)
	assert.Nil(t, request.MaxOutputTokens)
	assert.JSONEq(t, `false`, string(request.Store))
	assert.JSONEq(t, `"You are a helpful assistant."`, string(request.Instructions))
	assert.JSONEq(t, `{"verbosity":"low"}`, string(request.Text))
	assert.JSONEq(t, `["reasoning.encrypted_content"]`, string(request.Include))
	assert.JSONEq(t, `"auto"`, string(request.ToolChoice))
	assert.JSONEq(t, `true`, string(request.ParallelToolCalls))
}

func TestCodexCompatibilityInjectsChannelSystemPrompt(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	buildInfo := func(systemPrompt string, override bool, clientInstructions string) *relaycommon.RelayInfo {
		info := &relaycommon.RelayInfo{
			IsStream: true,
			ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType: constant.ChannelTypeCodexCompatibility,
				ApiKey:      "test-key",
			},
		}
		info.ChannelSetting.SystemPrompt = systemPrompt
		info.ChannelSetting.SystemPromptOverride = override
		_ = clientInstructions
		return info
	}

	t.Run("empty instructions uses system prompt", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		info := buildInfo("custom system prompt", false, "")
		converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{Model: "gpt-5.6-sol"})
		require.NoError(t, err)
		request, ok := converted.(dto.OpenAIResponsesRequest)
		require.True(t, ok)
		assert.JSONEq(t, `"custom system prompt"`, string(request.Instructions))
	})

	t.Run("override appends to client instructions", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		info := buildInfo("custom system prompt", true, "")
		converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{
			Model:        "gpt-5.6-sol",
			Instructions: json.RawMessage(`"client instructions"`),
		})
		require.NoError(t, err)
		request, ok := converted.(dto.OpenAIResponsesRequest)
		require.True(t, ok)
		assert.JSONEq(t, `"custom system prompt\nclient instructions"`, string(request.Instructions))
	})

	t.Run("no override keeps client instructions", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		info := buildInfo("custom system prompt", false, "")
		converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{
			Model:        "gpt-5.6-sol",
			Instructions: json.RawMessage(`"client instructions"`),
		})
		require.NoError(t, err)
		request, ok := converted.(dto.OpenAIResponsesRequest)
		require.True(t, ok)
		assert.JSONEq(t, `"client instructions"`, string(request.Instructions))
	})

	t.Run("no system prompt falls back to default", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		info := buildInfo("", false, "")
		converted, err := (&Adaptor{}).ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{Model: "gpt-5.6-sol"})
		require.NoError(t, err)
		request, ok := converted.(dto.OpenAIResponsesRequest)
		require.True(t, ok)
		assert.JSONEq(t, `"You are a helpful assistant."`, string(request.Instructions))
	})
}

func TestCodexCompatibilityPassesThroughSessionHeaders(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })

	clientHeaders := map[string]string{
		"Session-Id":               "sess-abc",
		"Thread-Id":                "thread-xyz",
		"X-Codex-Turn-State":       "turn-token-123",
		"X-Codex-Beta-Features":    "memgen,tools",
		"X-Codex-Installation-Id":  "inst-456",
		"X-Codex-Turn-Metadata":    "meta-1",
		"X-Codex-Parent-Thread-Id": "parent-0",
		"X-Codex-Window-Id":        "win-7",
		"X-Openai-Subagent":        "true",
	}

	run := func(t *testing.T, present map[string]string) http.Header {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		for k, v := range present {
			c.Request.Header.Set(k, v)
		}
		info := &relaycommon.RelayInfo{
			IsStream: true,
			ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType: constant.ChannelTypeCodexCompatibility,
				ApiKey:      "test-key",
			},
		}
		headers := http.Header{}
		require.NoError(t, (&Adaptor{}).SetupRequestHeader(c, &headers, info))
		return headers
	}

	t.Run("passes through all client session headers", func(t *testing.T) {
		headers := run(t, clientHeaders)
		for k, v := range clientHeaders {
			assert.Equal(t, v, headers.Get(k), "header %s should be passed through", k)
		}
	})

	t.Run("keeps fixed identity headers", func(t *testing.T) {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		// 客户端尝试伪造固定身份头
		c.Request.Header.Set("OpenAI-Beta", "forged")
		c.Request.Header.Set("Originator", "forged")
		c.Request.Header.Set("Authorization", "Bearer forged")
		info := &relaycommon.RelayInfo{
			IsStream: true,
			ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType: constant.ChannelTypeCodexCompatibility,
				ApiKey:      "test-key",
			},
		}
		headers := http.Header{}
		require.NoError(t, (&Adaptor{}).SetupRequestHeader(c, &headers, info))
		assert.Equal(t, "Bearer test-key", headers.Get("Authorization"))
		assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
		assert.Equal(t, "codex_cli_rs", headers.Get("Originator"))
	})

	t.Run("ignores absent headers", func(t *testing.T) {
		headers := run(t, nil)
		assert.Empty(t, headers.Get("session-id"))
		assert.Empty(t, headers.Get("x-codex-turn-state"))
	})
}

func TestChannelTestCanDisableCompatibilityClientProfiles(t *testing.T) {
	oldMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(oldMode) })
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)

	t.Run("Codex compatibility", func(t *testing.T) {
		maxOutputTokens := uint(4096)
		info := &relaycommon.RelayInfo{
			IsChannelTest:                   true,
			DisableChannelTestClientProfile: true,
			ChannelMeta: &relaycommon.ChannelMeta{
				ChannelType: constant.ChannelTypeCodexCompatibility,
				ApiKey:      "test-key",
			},
		}
		adaptor := &Adaptor{}
		adaptor.Init(info)
		headers := http.Header{}
		require.NoError(t, adaptor.SetupRequestHeader(c, &headers, info))
		assert.Equal(t, "Bearer test-key", headers.Get("Authorization"))
		assert.Empty(t, headers.Get("Originator"))
		assert.Empty(t, headers.Get("OpenAI-Beta"))

		converted, err := adaptor.ConvertOpenAIResponsesRequest(c, info, dto.OpenAIResponsesRequest{
			Model:           "gpt-test",
			MaxOutputTokens: &maxOutputTokens,
		})
		require.NoError(t, err)
		request, ok := converted.(dto.OpenAIResponsesRequest)
		require.True(t, ok)
		assert.Equal(t, &maxOutputTokens, request.MaxOutputTokens)
		assert.Empty(t, request.Instructions)
	})
}

func TestCodexCompatibilityResolvesPiResponsesPath(t *testing.T) {
	adaptor := &Adaptor{}
	tests := []struct {
		baseURL string
		mode    int
		wantURL string
	}{
		{baseURL: "https://proxy.example/backend-api", wantURL: "https://proxy.example/backend-api/codex/responses"},
		{baseURL: "https://proxy.example/backend-api/codex", wantURL: "https://proxy.example/backend-api/codex/responses"},
		{baseURL: "https://proxy.example/backend-api/codex/responses/", wantURL: "https://proxy.example/backend-api/codex/responses"},
		// 纯 host / /v1 形态：拼标准 OpenAI Responses 端点
		{baseURL: "https://proxy.example", mode: relayconstant.RelayModeResponses, wantURL: "https://proxy.example/v1/responses"},
		{baseURL: "https://proxy.example", mode: relayconstant.RelayModeResponsesCompact, wantURL: "https://proxy.example/v1/responses/compact"},
		{baseURL: "https://proxy.example/v1", mode: relayconstant.RelayModeResponses, wantURL: "https://proxy.example/v1/responses"},
		{baseURL: "https://proxy.example/v1", mode: relayconstant.RelayModeResponsesCompact, wantURL: "https://proxy.example/v1/responses/compact"},
		// 已含完整端点的形态
		{baseURL: "https://proxy.example/v1/responses", mode: relayconstant.RelayModeResponsesCompact, wantURL: "https://proxy.example/v1/responses/compact"},
		{baseURL: "https://proxy.example/codex/responses", mode: relayconstant.RelayModeResponses, wantURL: "https://proxy.example/codex/responses"},
		{baseURL: "https://proxy.example/codex/responses", mode: relayconstant.RelayModeResponsesCompact, wantURL: "https://proxy.example/codex/responses/compact"},
		{baseURL: "https://proxy.example/backend-api/codex/responses", mode: relayconstant.RelayModeResponsesCompact, wantURL: "https://proxy.example/backend-api/codex/responses/compact"},
		{baseURL: "https://proxy.example/backend-api/codex/responses/compact", mode: relayconstant.RelayModeResponses, wantURL: "https://proxy.example/backend-api/codex/responses/compact"},
	}

	for _, test := range tests {
		t.Run(test.baseURL, func(t *testing.T) {
			requestURL, err := adaptor.GetRequestURL(&relaycommon.RelayInfo{
				RelayMode: test.mode,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelType:    constant.ChannelTypeCodexCompatibility,
					ChannelBaseUrl: test.baseURL,
				},
			})

			require.NoError(t, err)
			assert.Equal(t, test.wantURL, requestURL)
		})
	}
}
