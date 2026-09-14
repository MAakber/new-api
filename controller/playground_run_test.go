package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func playgroundMCPFixture(t *testing.T, handler mcp.ToolHandler) {
	t.Helper()
	oldDB, oldRelay := model.DB, invokePlaygroundChatRound
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.MCPServer{}))
	t.Cleanup(func() {
		service.InvalidateMCPServer(1)
		model.DB = oldDB
		invokePlaygroundChatRound = oldRelay
		require.NoError(t, sqlDB.Close())
	})
	server := mcp.NewServer(&mcp.Implementation{Name: "fixture", Version: "1"}, nil)
	server.AddTool(&mcp.Tool{Name: "search", Description: "Search sources", InputSchema: map[string]any{"type": "object", "properties": map[string]any{"query": map[string]any{"type": "string", "minLength": 1}}, "required": []string{"query"}, "additionalProperties": false}}, handler)
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil))
	t.Cleanup(httpServer.Close)
	config := service.MCPServerConfig{Name: "fixture", URL: httpServer.URL, Enabled: true, Groups: []string{"allowed"}, TimeoutSeconds: 5, MaxConcurrency: 4}
	saved, err := service.PrepareMCPServer(config, nil)
	require.NoError(t, err)
	discovered, err := service.TestMCPConnection(t.Context(), *saved)
	require.NoError(t, err)
	require.Len(t, discovered, 1)
	config.Tools = []service.MCPToolConfig{{Name: "search", Enabled: true, ReadOnly: true, Kind: "search", SchemaHash: discovered[0].SchemaHash}}
	saved, err = service.PrepareMCPServer(config, nil)
	require.NoError(t, err)
	require.NoError(t, model.SaveMCPServer(saved))
}

func playgroundTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	writer := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(writer)
	c.Request = httptest.NewRequest(http.MethodPost, "/pg/chat/completions", nil)
	c.Set("user_group", "allowed")
	return c, writer
}

func TestPlaygroundMCPBatchesAndUsage(t *testing.T) {
	for _, stream := range []bool{false, true} {
		t.Run(fmt.Sprint(stream), func(t *testing.T) {
			var count atomic.Int32
			playgroundMCPFixture(t, func(_ context.Context, request *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				count.Add(1)
				var input map[string]string
				if err := common.Unmarshal(request.Params.Arguments, &input); err != nil {
					return nil, err
				}
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: `{"url":"https://example.com/` + input["query"] + `","title":"Source"}`}}}, nil
			})
			c, writer := playgroundTestContext()
			rounds := 0
			invokePlaygroundChatRound = func(current *gin.Context, request *dto.GeneralOpenAIRequest, emit func(playgroundDelta) error) (*playgroundRelayRound, *types.NewAPIError) {
				rounds++
				if stream {
					assert.True(t, writer.Flushed)
				}
				message := dto.Message{Role: "assistant"}
				reason := "tool_calls"
				switch rounds {
				case 1:
					require.Len(t, request.Tools, 1)
					assert.Contains(t, request.Messages[0].StringContent(), "untrusted")
					message.SetToolCalls([]dto.ToolCallRequest{{ID: "a", Type: "function", Function: dto.FunctionRequest{Name: request.Tools[0].Function.Name, Arguments: `{"query":"weather"}`}}, {ID: "b", Type: "function", Function: dto.FunctionRequest{Name: request.Tools[0].Function.Name, Arguments: `{"query":"air"}`}}})
				case 2:
					require.Len(t, request.Messages, 4)
					assert.Equal(t, "a", request.Messages[2].ToolCallId)
					assert.Equal(t, "b", request.Messages[3].ToolCallId)
					assert.Equal(t, 2, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests))
					message.SetToolCalls([]dto.ToolCallRequest{{ID: "c", Type: "function", Function: dto.FunctionRequest{Name: request.Tools[0].Function.Name, Arguments: `{"query":"forecast"}`}}})
				case 3:
					assert.Equal(t, 1, common.GetContextKeyInt(current, constant.ContextKeyWebSearchRequests), "previous searches must not be charged again")
					message.SetStringContent("See https://example.com/forecast")
					require.NoError(t, emit(playgroundDelta{Content: message.StringContent()}))
					reason = "stop"
				default:
					t.Fatal("unexpected model round")
				}
				return &playgroundRelayRound{Response: dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: message, FinishReason: reason}}}, RawUsage: []byte(`{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":40}}`), Duration: time.Second}, nil
			}
			require.Nil(t, playgroundWithTools(c, &dto.GeneralOpenAIRequest{Model: "fixture", Stream: common.GetPointer(stream)}, playgroundOptions{SearchMode: "mcp"}))
			assert.EqualValues(t, 3, count.Load())
			assert.Equal(t, 3, rounds)
			assert.Contains(t, writer.Body.String(), `"input_tokens":300`)
			assert.Contains(t, writer.Body.String(), `"cached_tokens":120`)
			assert.Contains(t, writer.Body.String(), `"cited":true`)
			if stream {
				assert.Equal(t, 1, strings.Count(writer.Body.String(), "data: [DONE]"))
				assert.Contains(t, writer.Body.String(), `"state":"completed"`)
			} else {
				var response struct {
					Playground playgroundRunData `json:"playground"`
					Usage      dto.Usage         `json:"usage"`
				}
				require.NoError(t, common.Unmarshal(writer.Body.Bytes(), &response))
				require.Len(t, response.Playground.ToolCalls, 3)
				assert.Equal(t, 300, response.Usage.PromptTokens)
				assert.Equal(t, 60, response.Usage.CompletionTokens)
			}
		})
	}
}

func TestPlaygroundValidatesWholeMCPBatch(t *testing.T) {
	for _, scenario := range []string{"duplicate ID", "missing ID", "unknown tool", "malformed JSON", "schema mismatch", "identical call"} {
		t.Run(scenario, func(t *testing.T) {
			var count atomic.Int32
			playgroundMCPFixture(t, func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				count.Add(1)
				return &mcp.CallToolResult{}, nil
			})
			invokePlaygroundChatRound = func(_ *gin.Context, request *dto.GeneralOpenAIRequest, _ func(playgroundDelta) error) (*playgroundRelayRound, *types.NewAPIError) {
				a := dto.ToolCallRequest{ID: "a", Type: "function", Function: dto.FunctionRequest{Name: request.Tools[0].Function.Name, Arguments: `{"query":"weather"}`}}
				b := a
				b.ID = "b"
				b.Function.Arguments = `{"query":"air"}`
				switch scenario {
				case "duplicate ID":
					b.ID = "a"
				case "missing ID":
					b.ID = ""
				case "unknown tool":
					b.Function.Name = "unapproved"
				case "malformed JSON":
					b.Function.Arguments = `{"query":`
				case "schema mismatch":
					b.Function.Arguments = `{"query":5}`
				case "identical call":
					b.Function.Arguments = a.Function.Arguments
				}
				message := dto.Message{Role: "assistant"}
				message.SetToolCalls([]dto.ToolCallRequest{a, b})
				return &playgroundRelayRound{Response: dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: message}}}}, nil
			}
			c, _ := playgroundTestContext()
			require.NotNil(t, playgroundWithTools(c, &dto.GeneralOpenAIRequest{Model: "fixture"}, playgroundOptions{SearchMode: "mcp"}))
			assert.Zero(t, count.Load())
		})
	}
}

func TestPlaygroundFailurePreservesProgress(t *testing.T) {
	previous := invokePlaygroundChatRound
	t.Cleanup(func() { invokePlaygroundChatRound = previous })
	invokePlaygroundChatRound = func(_ *gin.Context, _ *dto.GeneralOpenAIRequest, emit func(playgroundDelta) error) (*playgroundRelayRound, *types.NewAPIError) {
		require.NoError(t, emit(playgroundDelta{Content: "partial answer"}))
		return &playgroundRelayRound{RawUsage: []byte(`{"prompt_tokens":9,"completion_tokens":2}`)}, playgroundRunError(errors.New("provider unavailable"), 502)
	}
	for _, stream := range []bool{true, false} {
		t.Run(fmt.Sprint(stream), func(t *testing.T) {
			c, writer := playgroundTestContext()
			failure := playgroundWithTools(c, &dto.GeneralOpenAIRequest{Stream: common.GetPointer(stream)}, playgroundOptions{SearchMode: "off"})
			require.NotNil(t, failure)
			writePlaygroundError(c, failure)
			assert.Contains(t, writer.Body.String(), "partial answer")
			assert.Contains(t, writer.Body.String(), `"input_tokens":9`)
			assert.Contains(t, writer.Body.String(), `"partial":true`)
			assert.Contains(t, writer.Body.String(), "provider unavailable")
			if stream {
				assert.True(t, strings.HasSuffix(writer.Body.String(), "data: [DONE]\n\n"))
			} else {
				assert.Equal(t, http.StatusBadGateway, writer.Code)
			}
		})
	}
}

func TestPlaygroundModesAndCancellation(t *testing.T) {
	previous := invokePlaygroundChatRound
	t.Cleanup(func() { invokePlaygroundChatRound = previous })
	for _, mode := range []string{"off", "native"} {
		t.Run(mode, func(t *testing.T) {
			called := false
			invokePlaygroundChatRound = func(_ *gin.Context, request *dto.GeneralOpenAIRequest, _ func(playgroundDelta) error) (*playgroundRelayRound, *types.NewAPIError) {
				called = true
				assert.Equal(t, mode == "native", request.WebSearchOptions != nil)
				assert.Empty(t, request.Tools)
				return &playgroundRelayRound{Response: dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{Message: dto.Message{Role: "assistant", Content: "ok"}}}}}, nil
			}
			c, _ := playgroundTestContext()
			require.Nil(t, playgroundWithTools(c, &dto.GeneralOpenAIRequest{}, playgroundOptions{SearchMode: mode}))
			assert.True(t, called)
			called = false
			c, _ = playgroundTestContext()
			ctx, cancel := context.WithCancel(c.Request.Context())
			cancel()
			c.Request = c.Request.WithContext(ctx)
			require.NotNil(t, playgroundWithTools(c, &dto.GeneralOpenAIRequest{}, playgroundOptions{SearchMode: mode}))
			assert.False(t, called)
		})
	}
}

func TestPlaygroundRoundWriterHandlesFragmentedCallsAndFinalUsage(t *testing.T) {
	var deltas []playgroundDelta
	writer := &playgroundRoundWriter{header: http.Header{"Content-Type": []string{"text/event-stream"}}, calls: make(map[int]*dto.ToolCallRequest), started: time.Now(), round: playgroundRelayRound{Response: dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{}}}}, emit: func(delta playgroundDelta) error { deltas = append(deltas, delta); return nil }}
	for _, data := range []string{
		`{"choices":[{"index":0,"delta":{"reasoning_content":"thinking","tool_calls":[{"index":0,"id":"call_a","function":{"name":"search","arguments":"{\"que"}}]}}]}`,
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\":\"weather\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":3}}`,
		`{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":0}}}`,
		`[DONE]`,
	} {
		payload := "data: " + data + "\n\n"
		half := len(payload) / 2
		_, err := writer.Write([]byte(payload[:half]))
		require.NoError(t, err)
		_, err = writer.Write([]byte(payload[half:]))
		require.NoError(t, err)
	}
	round, failure := writer.result()
	require.Nil(t, failure)
	calls := round.Response.Choices[0].Message.ParseToolCalls()
	require.Len(t, calls, 1)
	assert.JSONEq(t, `{"query":"weather"}`, calls[0].Function.Arguments)
	assert.Equal(t, "thinking", deltas[0].Reasoning)
	var total playgroundUsage
	total.addRound(round, 0)
	require.NotNil(t, total.OutputTokens)
	assert.EqualValues(t, 5, *total.OutputTokens)
	require.NotNil(t, total.CachedTokens)
	assert.Zero(t, *total.CachedTokens)
}

func TestPlaygroundLaterCitationsSurviveCandidateLimits(t *testing.T) {
	var sources []playgroundWebSearchSource
	for i := range 40 {
		sources = append(sources, playgroundWebSearchSource{Href: fmt.Sprintf("https://example.com/%d", i)})
	}
	sources = citedPlaygroundSources(sources, "Reference https://example.com/39")
	require.NotEmpty(t, sources)
	assert.Equal(t, "https://example.com/39", sources[0].Href)
	assert.True(t, sources[0].Cited)
	assert.Empty(t, mergePlaygroundSources(nil, []playgroundWebSearchSource{{Href: "javascript:alert(1)"}, {Href: "https://user:pass@example.com"}}))
}

func TestPlaygroundSourcesRequireRetrievedEvidence(t *testing.T) {
	answer := "See https://weather.example.com/beijing and https://suggested.example.com/"
	assert.Empty(t, citedPlaygroundSources(nil, answer), "links generated in an answer do not prove a search was performed")

	sources := citedPlaygroundSources([]playgroundWebSearchSource{
		{Href: "https://weather.example.com/beijing", Title: "Retrieved forecast"},
		{Href: "https://annotations.example.com/", Title: "Provider citation", Cited: true},
	}, answer)
	require.Len(t, sources, 2)
	assert.Equal(t, "https://weather.example.com/beijing", sources[0].Href)
	assert.True(t, sources[0].Cited)
	assert.Equal(t, "https://annotations.example.com/", sources[1].Href)
	assert.True(t, sources[1].Cited, "provider annotations remain citations without a literal URL in the answer")
}

func TestPlaygroundUsagePreservesProviderSemantics(t *testing.T) {
	for _, test := range []struct {
		name, raw                                 string
		input, output, cached, written, reasoning *int64
		partial                                   bool
	}{
		{name: "reported zero", raw: `{"prompt_tokens":0,"completion_tokens":0,"prompt_tokens_details":{"cached_tokens":0}}`, input: common.GetPointer(int64(0)), output: common.GetPointer(int64(0)), cached: common.GetPointer(int64(0))},
		{name: "missing output", raw: `{"prompt_tokens":5}`, input: common.GetPointer(int64(5)), partial: true},
		{name: "responses cache", raw: `{"input_tokens":20,"output_tokens":4,"input_tokens_details":{"cached_tokens":12}}`, input: common.GetPointer(int64(20)), output: common.GetPointer(int64(4)), cached: common.GetPointer(int64(12))},
		{name: "anthropic inclusive input", raw: `{"billing_usage":{"source":"claude_messages","claude_usage":{"input_tokens":20,"output_tokens":6,"cache_read_input_tokens":40,"cache_creation_input_tokens":30}}}`, input: common.GetPointer(int64(90)), output: common.GetPointer(int64(6)), cached: common.GetPointer(int64(40)), written: common.GetPointer(int64(30))},
		{name: "gemini reasoning and tool input", raw: `{"billing_usage":{"source":"gemini_chat","gemini_usage_metadata":{"promptTokenCount":30,"toolUsePromptTokenCount":3,"candidatesTokenCount":5,"thoughtsTokenCount":2,"cachedContentTokenCount":12}}}`, input: common.GetPointer(int64(33)), output: common.GetPointer(int64(7)), cached: common.GetPointer(int64(12)), reasoning: common.GetPointer(int64(2))},
	} {
		t.Run(test.name, func(t *testing.T) {
			var usage playgroundUsage
			usage.addRound(&playgroundRelayRound{RawUsage: []byte(test.raw), FirstToken: 250 * time.Millisecond}, 2*time.Second)
			assert.Equal(t, test.input, usage.InputTokens)
			assert.Equal(t, test.output, usage.OutputTokens)
			assert.Equal(t, test.cached, usage.CachedTokens)
			assert.Equal(t, test.written, usage.CacheWriteTokens)
			assert.Equal(t, test.reasoning, usage.ReasoningTokens)
			assert.Equal(t, test.partial, usage.Partial)
			assert.Equal(t, common.GetPointer(int64(2250)), usage.FirstTokenMS, "include MCP discovery time before the first model round")
			if test.input != nil && test.output != nil {
				assert.Equal(t, common.GetPointer(*test.input+*test.output), usage.TotalTokens)
			}
		})
	}
}
