package vercel

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConvertOpenAIRequestBuildsLanguageModelV3Prompt(t *testing.T) {
	maxTokens := uint(0)
	temperature := 0.0
	toolCalls, err := common.Marshal([]dto.ToolCallRequest{{
		ID:   "call_1",
		Type: "function",
		Function: dto.FunctionRequest{
			Name:      "lookup",
			Arguments: `{"city":"Paris"}`,
		},
	}})
	require.NoError(t, err)
	request := &dto.GeneralOpenAIRequest{
		Model:       "zai/glm-5.2",
		MaxTokens:   &maxTokens,
		Temperature: &temperature,
		Messages: []dto.Message{
			{Role: "system", Content: "Be concise."},
			{Role: "assistant", Content: "", ToolCalls: toolCalls},
			{Role: "tool", Content: `{"temperature":18}`, ToolCallId: "call_1"},
			{Role: "user", Content: "Summarize the result."},
		},
		Tools: []dto.ToolCallRequest{{
			Type: "function",
			Function: dto.FunctionRequest{
				Name:        "lookup",
				Description: "Look up weather",
				Parameters: map[string]any{
					"type": "object",
				},
			},
		}},
		ToolChoice: map[string]any{
			"type": "function",
			"function": map[string]any{
				"name": "lookup",
			},
		},
	}

	converted, err := convertOpenAIRequest(request, "fx")
	require.NoError(t, err)
	require.NotNil(t, converted.MaxOutputTokens)
	assert.Zero(t, *converted.MaxOutputTokens)
	require.NotNil(t, converted.Temperature)
	assert.Zero(t, *converted.Temperature)
	assert.Equal(t, map[string]string{
		"user-agent": "fx/0.0.3",
		"x-title":    "fx",
	}, converted.Headers)
	require.Len(t, converted.Prompt, 4)
	assert.Equal(t, "system", converted.Prompt[0].Role)
	assert.Equal(t, "Be concise.", converted.Prompt[0].Content)

	assistantParts, ok := converted.Prompt[1].Content.([]languageModelPart)
	require.True(t, ok)
	require.Len(t, assistantParts, 2)
	assert.Equal(t, "tool-call", assistantParts[1].Type)
	assert.Equal(t, "call_1", assistantParts[1].ToolCallID)
	assert.Equal(t, map[string]any{"city": "Paris"}, assistantParts[1].Input)

	toolParts, ok := converted.Prompt[2].Content.([]languageModelPart)
	require.True(t, ok)
	require.Len(t, toolParts, 1)
	require.NotNil(t, toolParts[0].Output)
	assert.Equal(t, "json", toolParts[0].Output.Type)
	assert.Equal(t, map[string]any{"temperature": float64(18)}, toolParts[0].Output.Value)
	require.Len(t, converted.Tools, 1)
	require.NotNil(t, converted.ToolChoice)
	assert.Equal(t, languageModelToolChoice{Type: "tool", ToolName: "lookup"}, *converted.ToolChoice)
}

func TestAdaptorBuildsPromoURLAndHeaders(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	info := &relaycommon.RelayInfo{
		IsStream: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeVercel,
			ChannelBaseUrl:    "https://ai-gateway.vercel.sh/v4/ai",
			ApiKey:            "vck_test",
			UpstreamModelName: "zai/glm-5.2",
		},
	}
	adaptor := &Adaptor{}

	requestURL, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://ai-gateway.vercel.sh/v4/ai/language-model", requestURL)
	header := make(http.Header)
	require.NoError(t, adaptor.SetupRequestHeader(ctx, &header, info))
	assert.Equal(t, "Bearer vck_test", header.Get("Authorization"))
	assert.Equal(t, "0.0.1", header.Get("ai-gateway-protocol-version"))
	assert.Equal(t, "api-key", header.Get("ai-gateway-auth-method"))
	assert.Equal(t, "3", header.Get("ai-language-model-specification-version"))
	assert.Equal(t, "zai/glm-5.2", header.Get("ai-language-model-id"))
	assert.Equal(t, "true", header.Get("ai-language-model-streaming"))
	assert.Equal(t, "eve/0.0.3", header.Get("User-Agent"))
	assert.Equal(t, "eve", header.Get("x-title"))
}

func TestLanguageModelHandlerConvertsStructuredResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(`{
  "id":"resp_1",
  "model":"zai/glm-5.2",
  "content":[
    {"type":"reasoning","text":"Think."},
    {"type":"text","text":"OK"},
    {"type":"tool-call","toolCallId":"call_1","toolName":"lookup","input":"{\"city\":\"Paris\"}"}
  ],
  "finishReason":{"unified":"tool-calls","raw":"tool_calls"},
  "usage":{
    "inputTokens":{"total":10,"cacheRead":2},
    "outputTokens":{"total":5,"reasoning":2},
    "raw":{"prompt_tokens":10,"completion_tokens":5}
  }
}`)),
	}
	info := &relaycommon.RelayInfo{
		RelayFormat: types.RelayFormatOpenAI,
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "zai/glm-5.2"},
	}

	usage, apiErr := languageModelHandler(ctx, resp, info)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	assert.Equal(t, 10, usage.PromptTokens)
	assert.Equal(t, 5, usage.CompletionTokens)
	assert.Equal(t, 2, usage.PromptTokensDetails.CachedTokens)
	assert.Equal(t, 2, usage.CompletionTokenDetails.ReasoningTokens)

	var output dto.OpenAITextResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &output))
	require.Len(t, output.Choices, 1)
	assert.Equal(t, "OK", output.Choices[0].Message.StringContent())
	assert.Equal(t, "Think.", output.Choices[0].Message.GetReasoningContent())
	assert.Equal(t, constant.FinishReasonToolCalls, output.Choices[0].FinishReason)
	var calls []dto.ToolCallResponse
	require.NoError(t, common.Unmarshal(output.Choices[0].Message.ToolCalls, &calls))
	require.Len(t, calls, 1)
	assert.Equal(t, "call_1", calls[0].ID)
	assert.Equal(t, "lookup", calls[0].Function.Name)
	assert.JSONEq(t, `{"city":"Paris"}`, calls[0].Function.Arguments)
}

func TestLanguageModelStreamHandlerDoesNotDuplicateCompletedToolCall(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	stream := strings.Join([]string{
		`data: {"type":"tool-input-start","id":"call_1","toolName":"lookup"}`,
		`data: {"type":"tool-input-delta","id":"call_1","delta":"{\"city\":"}`,
		`data: {"type":"tool-input-delta","id":"call_1","delta":"\"Paris\"}"}`,
		`data: {"type":"tool-call","toolCallId":"call_1","toolName":"lookup","input":"{\"city\":\"Paris\"}"}`,
		`data: {"type":"finish","finishReason":{"unified":"tool-calls"},"usage":{"raw":{"prompt_tokens":10,"completion_tokens":5}}}`,
		`DONE`,
	}, "\n")
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(stream)),
	}
	info := &relaycommon.RelayInfo{
		IsStream:           true,
		RelayFormat:        types.RelayFormatOpenAI,
		ShouldIncludeUsage: true,
		ChannelMeta:        &relaycommon.ChannelMeta{UpstreamModelName: "zai/glm-5.2"},
	}

	usage, apiErr := languageModelStreamHandler(ctx, resp, info)
	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	assert.Equal(t, 10, usage.PromptTokens)
	assert.Equal(t, 5, usage.CompletionTokens)

	var toolName strings.Builder
	var arguments strings.Builder
	var finishReason string
	for _, line := range strings.Split(recorder.Body.String(), "\n") {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			continue
		}
		var chunk dto.ChatCompletionsStreamResponse
		if err := common.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		for _, choice := range chunk.Choices {
			if choice.FinishReason != nil {
				finishReason = *choice.FinishReason
			}
			for _, call := range choice.Delta.ToolCalls {
				toolName.WriteString(call.Function.Name)
				arguments.WriteString(call.Function.Arguments)
			}
		}
	}
	assert.Equal(t, "lookup", toolName.String())
	assert.JSONEq(t, `{"city":"Paris"}`, arguments.String())
	assert.Equal(t, constant.FinishReasonToolCalls, finishReason)
	assert.Contains(t, recorder.Body.String(), "data: [DONE]")
}
