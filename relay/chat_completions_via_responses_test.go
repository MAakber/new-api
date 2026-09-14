package relay

import (
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	openaichannel "github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	relaytypes "github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/model_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestIsResponsesEventStreamContentType(t *testing.T) {
	tests := []struct {
		name        string
		contentType string
		want        bool
	}{
		{name: "plain", contentType: "text/event-stream", want: true},
		{name: "mixed case with charset", contentType: "Text/Event-Stream; charset=utf-8", want: true},
		{name: "json", contentType: "application/json", want: false},
		{name: "empty", contentType: "", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, isResponsesEventStreamContentType(tt.contentType))
		})
	}
}

func TestShouldUseResponsesStream(t *testing.T) {
	tests := []struct {
		name         string
		clientStream bool
		contentType  string
		want         bool
	}{
		{name: "client stream with headerless upstream", clientStream: true, contentType: "", want: true},
		{name: "non-stream client with headerless upstream", clientStream: false, contentType: "", want: false},
		{name: "non-stream client with SSE upstream", clientStream: false, contentType: "text/event-stream", want: true},
		{name: "non-stream client with mixed case SSE upstream", clientStream: false, contentType: "Text/Event-Stream; charset=utf-8", want: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, shouldUseResponsesStream(tt.clientStream, tt.contentType))
		})
	}
}

func TestRecalcQuotaFromRatiosIgnoresInvalidMultipliers(t *testing.T) {
	info := &relaycommon.RelayInfo{
		PriceData: hosttypes.PriceData{
			Quota: 100,
		},
	}
	info.PriceData.AddOtherRatio("duration", 2)

	quota, ok := recalcQuotaFromRatios(info, map[string]float64{
		"duration": 3,
		"zero":     0,
		"negative": -1,
		"nan":      math.NaN(),
		"inf":      math.Inf(1),
	})

	require.True(t, ok)
	assert.Equal(t, 150, quota)
	assert.True(t, info.PriceData.HasOtherRatio("duration"))
}

func TestRecalcQuotaFromRatiosRejectsAllInvalidAdjustedRatios(t *testing.T) {
	info := &relaycommon.RelayInfo{
		PriceData: hosttypes.PriceData{
			Quota: 100,
		},
	}
	info.PriceData.AddOtherRatio("duration", 2)

	quota, ok := recalcQuotaFromRatios(info, map[string]float64{
		"zero":     0,
		"negative": -1,
		"nan":      math.NaN(),
		"inf":      math.Inf(1),
	})

	require.False(t, ok)
	assert.Equal(t, 0, quota)
	assert.True(t, info.PriceData.HasOtherRatio("duration"))
}

func TestTextRequestViaResponsesConvertsClaudeDirectly(t *testing.T) {
	type capturedRequest struct {
		path string
		body []byte
	}
	captured := make(chan capturedRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		captured <- capturedRequest{path: r.URL.Path, body: body}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"id":"resp_1",
			"object":"response",
			"status":"completed",
			"model":"gpt-5.6-sol",
			"output":[{"type":"message","id":"msg_1","role":"assistant","content":[{"type":"output_text","text":"ok"}]}],
			"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}
		}`))
	}))
	defer server.Close()

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	c.Request.Header.Set("Content-Type", "application/json")

	info := &relaycommon.RelayInfo{
		RelayMode:              relayconstant.RelayModeChatCompletions,
		RelayFormat:            relaytypes.RelayFormatClaude,
		OriginModelName:        "gpt-5.6-sol",
		RequestConversionChain: []relaytypes.RelayFormat{relaytypes.RelayFormatClaude},
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:       constant.ChannelTypeOpenAI,
			ChannelBaseUrl:    server.URL,
			ApiKey:            "test-key",
			UpstreamModelName: "gpt-5.6-sol",
		},
	}
	adaptor := &openaichannel.Adaptor{}
	adaptor.Init(info)
	request := &dto.ClaudeRequest{
		Model:    "gpt-5.6-sol",
		Thinking: &dto.Thinking{Type: "adaptive", Display: "summarized"},
		Messages: []dto.ClaudeMessage{{Role: "user", Content: "hello"}},
	}

	usage, apiErr := textRequestViaResponses(c, info, adaptor, request)

	require.Nil(t, apiErr)
	require.NotNil(t, usage)
	assert.Equal(t, 5, usage.TotalTokens)
	assert.Equal(t, []relaytypes.RelayFormat{relaytypes.RelayFormatClaude, relaytypes.RelayFormatOpenAIResponses}, info.RequestConversionChain)

	upstream := <-captured
	assert.Equal(t, "/v1/responses", upstream.path)
	var upstreamBody map[string]any
	require.NoError(t, common.Unmarshal(upstream.body, &upstreamBody))
	assert.NotContains(t, upstreamBody, "messages")
	reasoning, ok := upstreamBody["reasoning"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "high", reasoning["effort"])
	assert.Equal(t, "detailed", reasoning["summary"])

	var response dto.ClaudeResponse
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.Len(t, response.Content, 1)
	assert.Equal(t, "ok", response.Content[0].GetText())
}

func TestPlaygroundNativeSearchUpstreamRequest(t *testing.T) {
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	settings := model_setting.GetGlobalSettings()
	previousSettings := *settings
	t.Cleanup(func() { *settings = previousSettings })

	for _, test := range []struct {
		name, model, mappedModel, wantPath                string
		playground, search, stream                        bool
		channelPassthrough, globalPassthrough, wantReject bool
	}{
		{name: "native search uses Responses without a global conversion policy", model: "gpt-5.6-luna", playground: true, search: true, wantPath: "/v1/responses"},
		{name: "streaming native search uses Responses", model: "gpt-5.6-luna", playground: true, search: true, stream: true, wantPath: "/v1/responses"},
		{name: "mapped model keeps native search", model: "chat-default", mappedModel: "gpt-5.6-luna", playground: true, search: true, wantPath: "/v1/responses"},
		{name: "search off keeps Chat Completions", model: "gpt-5.6-luna", playground: true, wantPath: "/v1/chat/completions"},
		{name: "public Chat Completions retains its protocol", model: "gpt-5.6-luna", search: true, wantPath: "/v1/chat/completions"},
		{name: "mapped Chat search model keeps its supported endpoint", model: "chat-search", mappedModel: "gpt-5-search-api", playground: true, search: true, wantPath: "/v1/chat/completions"},
		{name: "legacy Chat search snapshot keeps its endpoint", model: "gpt-4o-mini-search-preview-2025-03-11", playground: true, search: true, wantPath: "/v1/chat/completions"},
		{name: "channel passthrough cannot silently disable native search", model: "gpt-5.6-luna", playground: true, search: true, channelPassthrough: true, wantReject: true},
		{name: "global passthrough cannot silently disable native search", model: "gpt-5.6-luna", playground: true, search: true, globalPassthrough: true, wantReject: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			*settings = previousSettings
			settings.ChatCompletionsToResponsesPolicy = model_setting.ChatCompletionsToResponsesPolicy{}
			settings.PassThroughRequestEnabled = test.globalPassthrough
			type upstreamRequest struct {
				path string
				body []byte
			}
			captured := make(chan upstreamRequest, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, err := io.ReadAll(r.Body)
				if err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}
				captured <- upstreamRequest{path: r.URL.Path, body: body}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = w.Write([]byte(`{"error":{"message":"native-search-contract","type":"invalid_request_error"}}`))
			}))
			t.Cleanup(server.Close)

			request := &dto.GeneralOpenAIRequest{
				Model: test.model, Stream: common.GetPointer(test.stream),
				Messages: []dto.Message{{Role: "user", Content: "Search today's Beijing weather."}},
				Tools: []dto.ToolCallRequest{{Type: "function", Function: dto.FunctionRequest{
					Name: "lookup_note", Parameters: map[string]any{"type": "object", "properties": map[string]any{}},
				}}},
			}
			if test.search {
				request.WebSearchOptions = &dto.WebSearchOptions{SearchContextSize: "medium"}
			}
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
			common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
			common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, server.URL)
			common.SetContextKey(c, constant.ContextKeyChannelKey, "local-fixture-only")
			common.SetContextKey(c, constant.ContextKeyOriginalModel, test.model)
			common.SetContextKey(c, constant.ContextKeyChannelSetting, dto.ChannelSettings{PassThroughBodyEnabled: test.channelPassthrough})
			if test.mappedModel != "" {
				mapping, err := common.Marshal(map[string]string{test.model: test.mappedModel})
				require.NoError(t, err)
				c.Set("model_mapping", string(mapping))
			}
			requestBody, err := common.Marshal(request)
			require.NoError(t, err)
			storage, err := common.CreateBodyStorage(requestBody)
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, storage.Close()) })
			c.Set(common.KeyBodyStorage, storage)
			info := &relaycommon.RelayInfo{
				Request: request, OriginModelName: test.model, IsPlayground: test.playground,
				RelayMode: relayconstant.RelayModeChatCompletions, RelayFormat: relaytypes.RelayFormatOpenAI,
				RequestURLPath: "/v1/chat/completions", IsStream: test.stream,
			}

			apiErr := TextHelper(c, info)

			require.NotNil(t, apiErr)
			assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
			if test.wantReject {
				assert.Contains(t, apiErr.Error(), "passthrough")
				assert.Empty(t, captured, "native search must not degrade to a request without a usable search tool")
				return
			}
			assert.Contains(t, apiErr.Error(), "native-search-contract", "upstream errors must be preserved without a Chat fallback")
			require.Len(t, captured, 1)
			upstream := <-captured
			assert.Equal(t, test.wantPath, upstream.path)
			var body struct {
				Model            string                `json:"model"`
				Stream           bool                  `json:"stream"`
				Tools            []map[string]any      `json:"tools"`
				WebSearchOptions *dto.WebSearchOptions `json:"web_search_options"`
			}
			require.NoError(t, common.Unmarshal(upstream.body, &body))
			wantModel := test.model
			if test.mappedModel != "" {
				wantModel = test.mappedModel
			}
			assert.Equal(t, wantModel, body.Model)
			assert.Equal(t, test.stream, body.Stream)
			if test.wantPath == "/v1/responses" {
				assert.Nil(t, body.WebSearchOptions)
				require.Len(t, body.Tools, 2)
				assert.Equal(t, "lookup_note", body.Tools[0]["name"])
				assert.Equal(t, map[string]any{"type": "web_search", "search_context_size": "medium"}, body.Tools[1])
			} else {
				assert.Equal(t, test.search, body.WebSearchOptions != nil)
				require.Len(t, body.Tools, 1)
				assert.Equal(t, "function", body.Tools[0]["type"])
			}
		})
	}
}

func TestTextRequestViaResponsesPreservesNativeSearchResult(t *testing.T) {
	previousMode := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(previousMode) })
	previousTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = previousTimeout })
	for _, test := range []struct {
		name                                                 string
		clientStream, upstreamStream, searched, terminalOnly bool
	}{
		{name: "JSON search result", searched: true},
		{name: "streamed search result", clientStream: true, upstreamStream: true, searched: true},
		{name: "buffered streamed search result", upstreamStream: true, searched: true},
		{name: "terminal snapshot preserves search count", clientStream: true, upstreamStream: true, searched: true, terminalOnly: true},
		{name: "offered search tool without execution is not charged"},
	} {
		t.Run(test.name, func(t *testing.T) {
			const call = `{"type":"web_search_call","id":"ws_1","status":"completed","action":{"type":"search","queries":["Beijing weather"]}}`
			const citation = `{"type":"url_citation","url":"https://weather.example.com/beijing","title":"Retrieved weather","start_index":0,"end_index":16}`
			annotations := ""
			if test.searched {
				annotations = citation
			}
			output := `{"type":"message","id":"msg_1","role":"assistant","status":"completed","content":[{"type":"output_text","text":"Weather fixture.","annotations":[` + annotations + `]}]}`
			if test.searched {
				output = call + "," + output
			}
			response := `{"id":"resp_search","object":"response","status":"completed","model":"gpt-5.6-luna","output":[` + output + `],"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}`
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if !test.upstreamStream {
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, response)
					return
				}
				w.Header().Set("Content-Type", "text/event-stream")
				_, _ = fmt.Fprint(w, "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_search\",\"model\":\"gpt-5.6-luna\"}}\n\n")
				if test.searched && !test.terminalOnly {
					_, _ = fmt.Fprintf(w, "data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":%s}\n\n", call)
				}
				_, _ = fmt.Fprint(w, "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Weather fixture.\"}\n\n")
				if test.searched {
					_, _ = fmt.Fprintf(w, "data: {\"type\":\"response.output_text.annotation.added\",\"output_index\":1,\"content_index\":0,\"annotation_index\":0,\"annotation\":%s}\n\n", citation)
				}
				_, _ = fmt.Fprintf(w, "data: {\"type\":\"response.completed\",\"response\":%s}\n\ndata: [DONE]\n\n", response)
			}))
			t.Cleanup(server.Close)
			recorder := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(recorder)
			c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
			info := &relaycommon.RelayInfo{
				OriginModelName: "gpt-5.6-luna", IsStream: test.clientStream, IsPlayground: true,
				RelayMode: relayconstant.RelayModeChatCompletions, RelayFormat: relaytypes.RelayFormatOpenAI,
				ShouldIncludeUsage: true, DisablePing: true,
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelType: constant.ChannelTypeOpenAI, ChannelBaseUrl: server.URL,
					ApiKey: "local-fixture-only", UpstreamModelName: "gpt-5.6-luna",
				},
			}
			adaptor := &openaichannel.Adaptor{}
			adaptor.Init(info)
			request := &dto.GeneralOpenAIRequest{
				Model: "gpt-5.6-luna", Stream: common.GetPointer(test.clientStream),
				Messages:         []dto.Message{{Role: "user", Content: "Search today's Beijing weather."}},
				WebSearchOptions: &dto.WebSearchOptions{SearchContextSize: "medium"},
			}

			usage, apiErr := textRequestViaResponses(c, info, adaptor, request)

			require.Nil(t, apiErr)
			require.NotNil(t, usage)
			assert.Equal(t, 5, usage.TotalTokens)
			result := recorder.Body.String()
			assert.Contains(t, result, "Weather fixture.")
			assert.NotContains(t, result, `"tool_calls":`, "hosted searches must not become client-side MCP calls")
			if test.searched {
				assert.Contains(t, result, `"url":"https://weather.example.com/beijing"`)
			}
			require.NotNil(t, info.ResponsesUsageInfo)
			searchUsage := info.ResponsesUsageInfo.BuiltInTools[dto.BuildInToolWebSearch]
			require.NotNil(t, searchUsage)
			wantCalls := 0
			if test.searched {
				wantCalls = 1
			}
			assert.Equal(t, wantCalls, searchUsage.CallCount, "a completed search is charged once even when repeated in the terminal snapshot")
		})
	}
}

func TestApplySystemPromptIfNeededSkipsToolLoadingMessages(t *testing.T) {
	tools := json.RawMessage(`[{"type":"function","function":{"name":"get_current_time","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}]`)
	toolLoading := dto.Message{Role: "system", Tools: tools}
	user := dto.Message{Role: "user", Content: "What time is it in Beijing?"}

	tests := []struct {
		name         string
		messages     []dto.Message
		wantMessages []dto.Message
		wantOverride bool
	}{
		{
			name:     "tool loading message alone is not a system prompt",
			messages: []dto.Message{toolLoading, user},
			wantMessages: []dto.Message{
				{Role: "system", Content: "Answer in English."},
				toolLoading,
				user,
			},
		},
		{
			name:     "override targets the real system prompt only",
			messages: []dto.Message{toolLoading, {Role: "system", Content: "You are Kimi."}, user},
			wantMessages: []dto.Message{
				toolLoading,
				{Role: "system", Content: "Answer in English.\nYou are Kimi."},
				user,
			},
			wantOverride: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
			info := &relaycommon.RelayInfo{
				ChannelMeta: &relaycommon.ChannelMeta{
					ChannelSetting: dto.ChannelSettings{
						SystemPrompt:         "Answer in English.",
						SystemPromptOverride: true,
					},
				},
			}
			request := &dto.GeneralOpenAIRequest{
				Model:    "kimi-k3",
				Messages: append([]dto.Message(nil), tt.messages...),
			}

			applySystemPromptIfNeeded(c, info, request)

			require.Len(t, request.Messages, len(tt.wantMessages))
			for i, want := range tt.wantMessages {
				got := request.Messages[i]
				assert.Equal(t, want.Role, got.Role, "message %d role", i)
				assert.Equal(t, want.Content, got.Content, "message %d content", i)
				if len(want.Tools) > 0 {
					assert.JSONEq(t, string(want.Tools), string(got.Tools), "message %d tools", i)
				} else {
					assert.Empty(t, got.Tools, "message %d tools", i)
				}
			}
			_, overrideSet := common.GetContextKey(c, constant.ContextKeySystemPromptOverride)
			assert.Equal(t, tt.wantOverride, overrideSet)
		})
	}
}
