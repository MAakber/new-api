package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
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

type fakePlaygroundBingSearcher struct {
	results  []bingsearch.Result
	query    string
	language string
}

func (f *fakePlaygroundBingSearcher) SearchWithLanguage(_ context.Context, query, language string) ([]bingsearch.Result, error) {
	f.query = query
	f.language = language
	return f.results, nil
}

func TestIsPlaygroundWebSearchEnabled(t *testing.T) {
	assert.True(t, isPlaygroundWebSearchEnabled(json.RawMessage(`true`)))
	assert.False(t, isPlaygroundWebSearchEnabled(json.RawMessage(`false`)))
	assert.False(t, isPlaygroundWebSearchEnabled(json.RawMessage(`"true"`)))
	assert.False(t, isPlaygroundWebSearchEnabled(nil))
}

func TestBuildPlaygroundWebSearchContextProtectsAndBoundsBingResults(t *testing.T) {
	contextText := buildPlaygroundWebSearchContext([]bingsearch.Result{
		{Title: "Example", URL: "https://example.com", Snippet: strings.Repeat("untrusted ", 20_000)},
	})

	assert.Contains(t, contextText, "BEGIN UNTRUSTED BING SEARCH RESULTS")
	assert.Contains(t, contextText, "Title: Example")
	assert.Contains(t, contextText, "URL: https://example.com")
	assert.LessOrEqual(t, len([]rune(contextText)), maxPlaygroundWebSearchContextChars)
}

func TestWritePlaygroundWebSearchResponseIncludesSourcesForNonStream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	response := &dto.OpenAITextResponse{
		Id:      "chatcmpl-test",
		Model:   "test-model",
		Object:  "chat.completion",
		Choices: []dto.OpenAITextResponseChoice{{Message: dto.Message{Role: "assistant", Content: "grounded answer"}, FinishReason: "stop"}},
	}

	err := writePlaygroundWebSearchResponse(context, response, []playgroundWebSearchSource{{Href: "https://example.com", Title: "Example"}}, false)

	require.Nil(t, err)
	var body map[string]any
	require.NoError(t, common.Unmarshal(writer.Body.Bytes(), &body))
	assert.Equal(t, "grounded answer", body["choices"].([]any)[0].(map[string]any)["message"].(map[string]any)["content"])
	assert.Equal(t, []any{map[string]any{"href": "https://example.com", "title": "Example"}}, body["sources"])
}

func TestWritePlaygroundWebSearchResponseIncludesSourcesForStream(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	response := &dto.OpenAITextResponse{
		Id:      "chatcmpl-test",
		Model:   "test-model",
		Object:  "chat.completion",
		Choices: []dto.OpenAITextResponseChoice{{Message: dto.Message{Role: "assistant", Content: "grounded answer"}, FinishReason: "stop"}},
	}

	err := writePlaygroundWebSearchResponse(context, response, []playgroundWebSearchSource{{Href: "https://example.com", Title: "Example"}}, true)

	require.Nil(t, err)
	assert.Contains(t, writer.Body.String(), `"web_search":{"sources":[{"href":"https://example.com","title":"Example"}]}`)
	assert.Contains(t, writer.Body.String(), `"content":"grounded answer"`)
	assert.Contains(t, writer.Body.String(), "data: [DONE]")
}

func TestPlaygroundWithWebSearchLetsModelChooseQueryAndReturnsSources(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	searcher := &fakePlaygroundBingSearcher{results: []bingsearch.Result{{Title: "Example", URL: "https://example.com", Snippet: "snippet"}}}
	relayRounds := 0

	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
	invokePlaygroundWebSearchRelayRound = func(current *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		relayRounds++
		assert.Nil(t, request.WebSearch)
		assert.Nil(t, request.WebSearchOptions)
		require.Len(t, request.Tools, 1)
		assert.Equal(t, "web_search", request.Tools[0].Function.Name)
		assert.Equal(t, "auto", request.ToolChoice)
		require.NotNil(t, request.ParallelTooCalls)
		assert.False(t, *request.ParallelTooCalls)
		assert.False(t, request.Stream != nil && *request.Stream)
		if relayRounds == 1 {
			assert.Equal(t, 0, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
			require.Len(t, request.Messages, 1)
			assistantMessage := dto.Message{Role: "assistant"}
			assistantMessage.SetToolCalls([]dto.ToolCallRequest{{
				ID:   "call_1",
				Type: "function",
				Function: dto.FunctionRequest{
					Name:      "web_search",
					Arguments: `{"query":"QuantumNous new-api GitHub"}`,
				},
			}})
			return &dto.OpenAITextResponse{
				Id:      "chatcmpl-tool-call",
				Model:   request.Model,
				Object:  "chat.completion",
				Choices: []dto.OpenAITextResponseChoice{{Message: assistantMessage, FinishReason: "tool_calls"}},
			}, nil
		}

		assert.Equal(t, 1, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
		require.Len(t, request.Messages, 3)
		assert.Equal(t, "assistant", request.Messages[1].Role)
		toolCalls := request.Messages[1].ParseToolCalls()
		require.Len(t, toolCalls, 1)
		assert.Equal(t, "call_1", toolCalls[0].ID)
		assert.Equal(t, "tool", request.Messages[2].Role)
		assert.Equal(t, "call_1", request.Messages[2].ToolCallId)
		assert.Contains(t, request.Messages[2].StringContent(), "UNTRUSTED")
		return &dto.OpenAITextResponse{
			Id:      "chatcmpl-test",
			Model:   request.Model,
			Object:  "chat.completion",
			Choices: []dto.OpenAITextResponseChoice{{Message: dto.Message{Role: "assistant", Content: "answer"}, FinishReason: "stop"}},
		}, nil
	}

	request := &dto.GeneralOpenAIRequest{
		Model:     "test-model",
		WebSearch: json.RawMessage(`true`),
		Messages:  []dto.Message{{Role: "user", Content: "北京天气怎么样"}},
		Stream:    common.GetPointer(false),
	}
	err := playgroundWithWebSearch(context, request)

	require.Nil(t, err)
	assert.Equal(t, "QuantumNous new-api GitHub", searcher.query)
	assert.Equal(t, "", searcher.language)
	assert.Equal(t, 2, relayRounds)
	assert.Contains(t, writer.Body.String(), `"sources":[{"href":"https://example.com","title":"Example"}]`)
}

func TestPlaygroundWithWebSearchDoesNotSearchWhenModelDoesNotCallTool(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	searcher := &fakePlaygroundBingSearcher{}

	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
	invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		return &dto.OpenAITextResponse{
			Id:      "chatcmpl-no-search",
			Model:   request.Model,
			Object:  "chat.completion",
			Choices: []dto.OpenAITextResponseChoice{{Message: dto.Message{Role: "assistant", Content: "无需搜索"}, FinishReason: "stop"}},
		}, nil
	}

	err := playgroundWithWebSearch(context, &dto.GeneralOpenAIRequest{
		Model:     "test-model",
		WebSearch: json.RawMessage(`true`),
		Messages:  []dto.Message{{Role: "user", Content: "你好"}},
	})

	require.Nil(t, err)
	assert.Empty(t, searcher.query)
	assert.Contains(t, writer.Body.String(), `"sources":[]`)
}

func TestPlaygroundWithWebSearchRejectsUnsupportedTool(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	searcher := &fakePlaygroundBingSearcher{}

	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
	invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		assistantMessage := dto.Message{Role: "assistant"}
		assistantMessage.SetToolCalls([]dto.ToolCallRequest{{
			ID:   "call_1",
			Type: "function",
			Function: dto.FunctionRequest{
				Name:      "get_weather",
				Arguments: `{"city":"北京"}`,
			},
		}})
		return &dto.OpenAITextResponse{
			Id:      "chatcmpl-unsupported-tool",
			Model:   request.Model,
			Object:  "chat.completion",
			Choices: []dto.OpenAITextResponseChoice{{Message: assistantMessage, FinishReason: "tool_calls"}},
		}, nil
	}

	err := playgroundWithWebSearch(context, &dto.GeneralOpenAIRequest{
		Model:     "test-model",
		WebSearch: json.RawMessage(`true`),
		Messages:  []dto.Message{{Role: "user", Content: "北京天气"}},
	})

	require.Error(t, err)
	assert.Equal(t, http.StatusBadGateway, err.StatusCode)
	assert.Empty(t, searcher.query)
}

func TestPlaygroundWithWebSearchLimitsSearchRounds(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	searcher := &fakePlaygroundBingSearcher{results: []bingsearch.Result{{Title: "Example", URL: "https://example.com"}}}
	relayRounds := 0

	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
	invokePlaygroundWebSearchRelayRound = func(_ *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		relayRounds++
		assistantMessage := dto.Message{Role: "assistant"}
		assistantMessage.SetToolCalls([]dto.ToolCallRequest{{
			ID:   fmt.Sprintf("call_%d", relayRounds),
			Type: "function",
			Function: dto.FunctionRequest{
				Name:      "web_search",
				Arguments: fmt.Sprintf(`{"query":"query-%d"}`, relayRounds),
			},
		}})
		return &dto.OpenAITextResponse{
			Id:      "chatcmpl-search-limit",
			Model:   request.Model,
			Object:  "chat.completion",
			Choices: []dto.OpenAITextResponseChoice{{Message: assistantMessage, FinishReason: "tool_calls"}},
		}, nil
	}

	err := playgroundWithWebSearch(context, &dto.GeneralOpenAIRequest{
		Model:     "test-model",
		WebSearch: json.RawMessage(`true`),
		Messages:  []dto.Message{{Role: "user", Content: "继续搜索"}},
	})

	require.Error(t, err)
	assert.Equal(t, http.StatusBadGateway, err.StatusCode)
	assert.Equal(t, 2, relayRounds)
	assert.Equal(t, "query-1", searcher.query)
}
