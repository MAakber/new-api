package controller

import (
	"context"
	"encoding/json"
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

func TestPlaygroundWithWebSearchUsesBingOnceAndClearsControlFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	writer := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(writer)
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	searcher := &fakePlaygroundBingSearcher{results: []bingsearch.Result{{Title: "Example", URL: "https://example.com", Snippet: "snippet"}}}

	previousSearcher := newPlaygroundBingSearchClient
	previousRelay := invokePlaygroundWebSearchRelayRound
	t.Cleanup(func() {
		newPlaygroundBingSearchClient = previousSearcher
		invokePlaygroundWebSearchRelayRound = previousRelay
	})
	newPlaygroundBingSearchClient = func() playgroundBingSearcher { return searcher }
	invokePlaygroundWebSearchRelayRound = func(current *gin.Context, request *dto.GeneralOpenAIRequest) (*dto.OpenAITextResponse, *types.NewAPIError) {
		assert.Nil(t, request.WebSearch)
		assert.Nil(t, request.WebSearchOptions)
		assert.Nil(t, request.Tools)
		assert.Nil(t, request.ToolChoice)
		assert.False(t, request.Stream != nil && *request.Stream)
		assert.Equal(t, 1, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
		assert.Contains(t, request.Messages[0].StringContent(), "UNTRUSTED")
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
		Messages:  []dto.Message{{Role: "user", Content: "latest question"}},
		Stream:    common.GetPointer(false),
	}
	err := playgroundWithWebSearch(context, request)

	require.Nil(t, err)
	assert.Equal(t, "latest question", searcher.query)
	assert.Equal(t, "", searcher.language)
	assert.Contains(t, writer.Body.String(), `"sources":[{"href":"https://example.com","title":"Example"}]`)
}
