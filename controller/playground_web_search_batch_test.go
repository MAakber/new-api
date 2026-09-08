package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/bingsearch"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type playgroundBingSearchFunc func(context.Context, string, string) ([]bingsearch.Result, error)

func (f playgroundBingSearchFunc) SearchWithLanguage(ctx context.Context, query, language string) ([]bingsearch.Result, error) {
	return f(ctx, query, language)
}

func TestPlaygroundWithWebSearchHandlesBatchedCallsAcrossRounds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name   string
		stream bool
	}{
		{name: "non-streaming"},
		{name: "streaming", stream: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			writer := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(writer)
			c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
			c.Request.Header.Set("Accept-Language", "zh-CN")
			toolCalls := []dto.ToolCallRequest{
				{ID: "call_weather", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"北京 今天天气"}`}},
				{ID: "call_air", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"北京 空气质量"}`}},
			}
			followupCall := dto.ToolCallRequest{ID: "call_forecast", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"北京 今天降雨预报"}`}}
			resultsByQuery := map[string][]bingsearch.Result{
				"北京 今天天气": {
					{Title: "Beijing weather", URL: "https://weather.example/beijing", Snippet: "Weather details"},
				},
				"北京 空气质量": {
					{Title: "Beijing air quality", URL: "https://air.example/beijing", Snippet: "Air quality details"},
					{Title: "Beijing weather", URL: "https://weather.example/beijing"},
				},
				"北京 今天降雨预报": {
					{Title: "Beijing forecast", URL: "https://forecast.example/beijing", Snippet: "Rain forecast"},
				},
			}
			var queries []string
			relayRounds := 0
			previousSearcher := newPlaygroundBingSearchClient
			previousRelay := invokePlaygroundWebSearchRelayRound
			t.Cleanup(func() {
				newPlaygroundBingSearchClient = previousSearcher
				invokePlaygroundWebSearchRelayRound = previousRelay
			})
			newPlaygroundBingSearchClient = func() playgroundBingSearcher {
				return playgroundBingSearchFunc(func(_ context.Context, query, language string) ([]bingsearch.Result, error) {
					assert.Equal(t, "zh-CN", language)
					require.Contains(t, resultsByQuery, query)
					queries = append(queries, query)
					return resultsByQuery[query], nil
				})
			}
			invokePlaygroundWebSearchRelayRound = func(current *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
				relayRounds++
				message := dto.Message{Role: "assistant"}
				finishReason := "tool_calls"
				switch relayRounds {
				case 1:
					require.Len(t, request.Messages, 1)
					message.SetToolCalls(toolCalls)
				case 2:
					require.Len(t, request.Messages, 4, "one assistant message must be followed by both tool results")
					assert.Equal(t, "assistant", request.Messages[1].Role)
					assert.Equal(t, toolCalls, request.Messages[1].ParseToolCalls())
					for index, call := range toolCalls {
						result := request.Messages[index+2]
						assert.Equal(t, "tool", result.Role)
						assert.Equal(t, call.ID, result.ToolCallId)
						assert.Contains(t, result.StringContent(), playgroundWebSearchSafetyInstruction)
					}
					assert.Contains(t, request.Messages[2].StringContent(), "Weather details")
					assert.NotContains(t, request.Messages[2].StringContent(), "Air quality details")
					assert.Contains(t, request.Messages[3].StringContent(), "Air quality details")
					assert.Equal(t, 2, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
					message.SetToolCalls([]dto.ToolCallRequest{followupCall})
				case 3:
					require.Len(t, request.Messages, 6)
					assert.Equal(t, "assistant", request.Messages[4].Role)
					assert.Equal(t, []dto.ToolCallRequest{followupCall}, request.Messages[4].ParseToolCalls())
					assert.Equal(t, "tool", request.Messages[5].Role)
					assert.Equal(t, followupCall.ID, request.Messages[5].ToolCallId)
					assert.Contains(t, request.Messages[5].StringContent(), "Rain forecast")
					assert.Equal(t, 3, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
					message.SetStringContent("北京天气资料已查到")
					finishReason = "stop"
				default:
					require.FailNow(t, "unexpected model round")
				}
				return &dto.OpenAITextResponse{
					Model: request.Model, Choices: []dto.OpenAITextResponseChoice{{Message: message, FinishReason: finishReason}},
				}, nil
			}

			err := playgroundWithWebSearch(c, &dto.GeneralOpenAIRequest{
				Model: "test-model", Stream: common.GetPointer(tc.stream),
				Messages: []dto.Message{{Role: "user", Content: "你搜一下今天的北京天气怎么样"}},
			})

			require.Nil(t, err)
			assert.Equal(t, []string{"北京 今天天气", "北京 空气质量", "北京 今天降雨预报"}, queries)
			assert.Equal(t, 3, relayRounds)
			assert.Equal(t, 3, common.GetContextKeyInt(c, constant.ContextKeyWebSearchRequests))
			sources, marshalErr := common.Marshal([]playgroundWebSearchSource{
				{Href: "https://weather.example/beijing", Title: "Beijing weather"},
				{Href: "https://air.example/beijing", Title: "Beijing air quality"},
				{Href: "https://forecast.example/beijing", Title: "Beijing forecast"},
			})
			require.NoError(t, marshalErr)
			assert.Contains(t, writer.Body.String(), `"sources":`+string(sources))
			assert.Contains(t, writer.Body.String(), `"content":"北京天气资料已查到"`)
			if tc.stream {
				assert.Contains(t, writer.Body.String(), "data: [DONE]\n\n")
			}
		})
	}
}

func TestPlaygroundWithWebSearchValidatesAllCallsBeforeSearching(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name    string
		id      string
		tool    string
		args    string
		message string
	}{
		{name: "duplicate ID", id: "call_1", tool: "web_search", args: `{"query":"air quality"}`, message: "web search tool call id was repeated"},
		{name: "missing ID", tool: "web_search", args: `{"query":"air quality"}`, message: "web search tool call is missing an id"},
		{name: "unsupported tool", id: "call_2", tool: "get_weather", args: `{"query":"air quality"}`, message: "web search returned an unsupported tool"},
		{name: "invalid arguments", id: "call_2", tool: "web_search", args: `{"query":`, message: "web search tool arguments are invalid"},
		{name: "repeated query", id: "call_2", tool: "web_search", args: `{"query":"  BEIJING   weather "}`, message: "web search query was repeated"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
			searcher := &fakePlaygroundBingSearcher{}
			previousSearcher := newPlaygroundBingSearchClient
			previousRelay := invokePlaygroundWebSearchRelayRound
			t.Cleanup(func() {
				newPlaygroundBingSearchClient = previousSearcher
				invokePlaygroundWebSearchRelayRound = previousRelay
			})
			newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
			invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, _ *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
				message := dto.Message{Role: "assistant"}
				message.SetToolCalls([]dto.ToolCallRequest{
					{ID: "call_1", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing weather"}`}},
					{ID: tc.id, Type: "function", Function: dto.FunctionRequest{Name: tc.tool, Arguments: tc.args}},
				})
				return &dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: message, FinishReason: "tool_calls"}}}, nil
			}

			err := playgroundWithWebSearch(c, &dto.GeneralOpenAIRequest{Model: "test-model"})

			require.NotNil(t, err)
			assert.Equal(t, tc.message, err.Error())
			assert.Equal(t, http.StatusBadGateway, err.StatusCode)
			assert.True(t, types.IsSkipRetryError(err))
			assert.Empty(t, searcher.queries)
			assert.Zero(t, common.GetContextKeyInt(c, constant.ContextKeyWebSearchRequests))
		})
	}
}

func TestPlaygroundWithWebSearchStopsBetweenBatchedCallsOnCancellation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	requestContext, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil).WithContext(requestContext)
	var queries []string
	relayRounds := 0
	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher {
		return playgroundBingSearchFunc(func(ctx context.Context, query, _ string) ([]bingsearch.Result, error) {
			require.NoError(t, ctx.Err())
			queries = append(queries, query)
			cancel()
			return []bingsearch.Result{{Title: "Weather", URL: "https://weather.example/beijing"}}, nil
		})
	}
	invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, _ *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		relayRounds++
		require.Equal(t, 1, relayRounds, "do not continue the model after cancellation")
		message := dto.Message{Role: "assistant"}
		message.SetToolCalls([]dto.ToolCallRequest{
			{ID: "call_1", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing weather"}`}},
			{ID: "call_2", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing air quality"}`}},
		})
		return &dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: message, FinishReason: "tool_calls"}}}, nil
	}

	err := playgroundWithWebSearch(c, &dto.GeneralOpenAIRequest{Model: "test-model"})

	require.NotNil(t, err)
	assert.ErrorIs(t, err, context.Canceled)
	assert.Equal(t, []string{"Beijing weather"}, queries)
	assert.Equal(t, 1, common.GetContextKeyInt(c, constant.ContextKeyWebSearchRequests))
	assert.Equal(t, 1, relayRounds)
}

func TestPlaygroundWithWebSearchStopsBatchAfterSearchFailure(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(writer)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	var queries []string
	relayRounds := 0
	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher {
		return playgroundBingSearchFunc(func(_ context.Context, query, _ string) ([]bingsearch.Result, error) {
			queries = append(queries, query)
			if query == "Beijing air quality" {
				return nil, bingsearch.ErrTimeout
			}
			return []bingsearch.Result{{Title: "Weather", URL: "https://weather.example/beijing"}}, nil
		})
	}
	invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, _ *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		relayRounds++
		require.Equal(t, 1, relayRounds, "do not submit an incomplete batch of tool results")
		message := dto.Message{Role: "assistant"}
		message.SetToolCalls([]dto.ToolCallRequest{
			{ID: "call_1", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing weather"}`}},
			{ID: "call_2", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing air quality"}`}},
			{ID: "call_3", Type: "function", Function: dto.FunctionRequest{Name: "web_search", Arguments: `{"query":"Beijing forecast"}`}},
		})
		return &dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: message, FinishReason: "tool_calls"}}}, nil
	}

	err := playgroundWithWebSearch(c, &dto.GeneralOpenAIRequest{Model: "test-model", Stream: common.GetPointer(true)})

	require.NotNil(t, err)
	assert.Equal(t, "web search timed out", err.Error())
	assert.True(t, types.IsSkipRetryError(err))
	assert.Equal(t, []string{"Beijing weather", "Beijing air quality"}, queries)
	assert.Equal(t, 1, common.GetContextKeyInt(c, constant.ContextKeyWebSearchRequests))
	assert.Equal(t, 1, relayRounds)
	writePlaygroundError(c, err)
	assert.Contains(t, writer.Body.String(), `"message":"web search timed out"`)
	assert.Contains(t, writer.Body.String(), "data: [DONE]\n\n")
}
