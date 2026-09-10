package controller

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestChannelProbeForwardsAllConversationProtocols(t *testing.T) {
	oldDB, oldLogDB, oldRedis := model.DB, model.LOG_DB, common.RedisEnabled
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, constant.StreamingTimeout = oldDB, oldLogDB, oldRedis, oldTimeout
	})
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	user := model.User{Id: 9111, Username: "protocol-probe", Group: "default", Status: common.UserStatusEnabled, Role: common.RoleRootUser, Quota: 1000000}
	require.NoError(t, db.Create(&user).Error)
	originalRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-4o":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalRatios)) })

	protocols := []struct {
		endpoint                             string
		channelType                          int
		path, toolPath, budgetPath           string
		textJSON, toolJSON, textSSE, toolSSE string
	}{
		{
			endpoint: "openai", channelType: constant.ChannelTypeOpenAI, path: "/v1/chat/completions", toolPath: "tools.0.function.name", budgetPath: "max_tokens",
			textJSON: `{"id":"chat-1","object":"chat.completion","model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","content":"pong"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}`,
			toolJSON: `{"id":"chat-1","object":"chat.completion","model":"gpt-4o","choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"call-1","type":"function","function":{"name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}`,
			textSSE:  channelProbeSSE(`{"id":"chat-1","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":"pong"},"finish_reason":null}]}`, `{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`, `{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}`, "[DONE]"),
			toolSSE:  channelProbeSSE(`{"id":"chat-1","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"channel_test_echo","arguments":"{\"message\":"}}]}}]}`, `{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"ping\"}"}}]},"finish_reason":"tool_calls"}]}`, `{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}`, "[DONE]"),
		},
		{
			endpoint: "openai-response", channelType: constant.ChannelTypeOpenAI, path: "/v1/responses", toolPath: "tools.0.name", budgetPath: "max_output_tokens",
			textJSON: `{"id":"resp-1","object":"response","model":"gpt-4o","status":"completed","output":[{"id":"msg-1","type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}],"usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}`,
			toolJSON: `{"id":"resp-1","object":"response","model":"gpt-4o","status":"completed","output":[{"id":"item-1","call_id":"call-1","type":"function_call","name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}],"usage":{"input_tokens":10,"output_tokens":8,"total_tokens":18}}`,
			textSSE:  channelProbeSSE(`{"type":"response.output_text.delta","item_id":"msg-1","output_index":0,"content_index":0,"delta":"pong"}`, `{"type":"response.completed","response":{"id":"resp-1","object":"response","model":"gpt-4o","status":"completed","output":[{"id":"msg-1","type":"message","role":"assistant","content":[{"type":"output_text","text":"pong"}]}],"usage":{"input_tokens":10,"output_tokens":2,"total_tokens":12}}}`),
			toolSSE:  channelProbeSSE(`{"type":"response.output_item.added","output_index":0,"item":{"id":"item-1","call_id":"call-1","type":"function_call","name":"channel_test_echo","arguments":""}}`, `{"type":"response.function_call_arguments.delta","item_id":"item-1","output_index":0,"delta":"{\"message\":"}`, `{"type":"response.function_call_arguments.delta","item_id":"item-1","output_index":0,"delta":"\"ping\"}"}`, `{"type":"response.completed","response":{"id":"resp-1","object":"response","model":"gpt-4o","status":"completed","output":[{"id":"item-1","call_id":"call-1","type":"function_call","name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}],"usage":{"input_tokens":10,"output_tokens":8,"total_tokens":18}}}`),
		},
		{
			endpoint: "anthropic", channelType: constant.ChannelTypeAnthropic, path: "/v1/messages", toolPath: "tools.0.name", budgetPath: "max_tokens",
			textJSON: `{"id":"msg-1","type":"message","role":"assistant","model":"gpt-4o","content":[{"type":"text","text":"pong"}],"stop_reason":"end_turn","usage":{"input_tokens":10,"output_tokens":2}}`,
			toolJSON: `{"id":"msg-1","type":"message","role":"assistant","model":"gpt-4o","content":[{"id":"call-1","type":"tool_use","name":"channel_test_echo","input":{"message":"ping"}}],"stop_reason":"tool_use","usage":{"input_tokens":10,"output_tokens":8}}`,
			textSSE:  channelProbeSSE(`{"type":"message_start","message":{"id":"msg-1","type":"message","role":"assistant","model":"gpt-4o","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}`, `{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"pong"}}`, `{"type":"content_block_stop","index":0}`, `{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}`, `{"type":"message_stop"}`),
			toolSSE:  channelProbeSSE(`{"type":"message_start","message":{"id":"msg-1","type":"message","role":"assistant","model":"gpt-4o","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}`, `{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"channel_test_echo","input":{}}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"message\":"}}`, `{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"ping\"}"}}`, `{"type":"content_block_stop","index":0}`, `{"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":8}}`, `{"type":"message_stop"}`),
		},
		{
			endpoint: "gemini", channelType: constant.ChannelTypeGemini, path: "/v1beta/models/gpt-4o:", toolPath: "tools.0.functionDeclarations.0.name", budgetPath: "generationConfig.maxOutputTokens",
			textJSON: `{"candidates":[{"index":0,"content":{"role":"model","parts":[{"text":"pong"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2,"totalTokenCount":12}}`,
			toolJSON: `{"candidates":[{"index":0,"content":{"role":"model","parts":[{"functionCall":{"name":"channel_test_echo","args":{"message":"ping"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":8,"totalTokenCount":18}}`,
			textSSE:  channelProbeSSE(`{"candidates":[{"index":0,"content":{"role":"model","parts":[{"text":"pong"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":2,"totalTokenCount":12}}`),
			toolSSE:  channelProbeSSE(`{"candidates":[{"index":0,"content":{"role":"model","parts":[{"functionCall":{"name":"channel_test_echo","args":{"message":"ping"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":8,"totalTokenCount":18}}`),
		},
	}
	for _, protocol := range protocols {
		for _, testType := range []string{"", "basic", "tool_call"} {
			for _, stream := range []bool{false, true} {
				mode := "json"
				if stream {
					mode = "stream"
				}
				for _, routing := range []string{"native", "custom"} {
					t.Run(protocol.endpoint+"/"+testType+"/"+mode+"/"+routing, func(t *testing.T) {
						response := protocol.textJSON
						if testType == "tool_call" {
							response = protocol.toolJSON
						}
						if stream {
							response = protocol.textSSE
							if testType == "tool_call" {
								response = protocol.toolSSE
							}
						}
						requests := make(chan []byte, 1)
						paths := make(chan string, 1)
						upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
							body, err := io.ReadAll(r.Body)
							if err != nil {
								w.WriteHeader(http.StatusBadRequest)
								return
							}
							requests <- body
							paths <- r.URL.RequestURI()
							w.Header().Set("Content-Type", "application/json")
							if stream {
								w.Header().Set("Content-Type", "text/event-stream")
							}
							_, _ = io.WriteString(w, response)
						}))
						t.Cleanup(upstream.Close)
						channel := &model.Channel{Id: 9112, Type: protocol.channelType, Key: "fixture-key", Models: "gpt-4o", Group: "default", Status: common.ChannelStatusEnabled, BaseURL: &upstream.URL}
						if testType == "tool_call" {
							overrides := map[string]any{protocol.budgetPath: 1}
							if protocol.endpoint == "gemini" {
								overrides = map[string]any{"generationConfig": map[string]any{"maxOutputTokens": 1}}
							}
							encoded, err := common.Marshal(overrides)
							require.NoError(t, err)
							channel.ParamOverride = common.GetPointer(string(encoded))
						}
						endpoint := protocol.endpoint
						expectedPath := protocol.path
						if routing == "custom" {
							channel.Type = constant.ChannelTypeAdvancedCustom
							if testType != "" {
								endpoint = ""
							}
							endpointInfo, ok := common.GetDefaultEndpointInfo(constant.EndpointType(protocol.endpoint))
							require.True(t, ok)
							routes := []dto.AdvancedCustomRoute{{IncomingPath: endpointInfo.Path, UpstreamPath: "/fixture" + endpointInfo.Path}}
							if protocol.endpoint == "gemini" {
								routes = append(routes, dto.AdvancedCustomRoute{IncomingPath: strings.ReplaceAll(endpointInfo.Path, ":generateContent", ":streamGenerateContent"), UpstreamPath: "/fixture" + strings.ReplaceAll(endpointInfo.Path, ":generateContent", ":streamGenerateContent")})
							}
							channel.SetOtherSettings(dto.ChannelOtherSettings{AdvancedCustom: &dto.AdvancedCustomConfig{Routes: routes}})
							expectedPath = "/fixture" + protocol.path
						}
						result := testChannelWithOptions(context.Background(), channel, user.Id, "gpt-4o", endpoint, stream, channelTestOptions{testType: testType, capturePreview: testType != ""})
						require.NoError(t, result.localErr)
						require.Nil(t, result.newAPIError)
						if testType != "" {
							require.NotNil(t, result.diagnostics)
							assert.Equal(t, "passed", result.diagnostics.Status, result.diagnostics.Reason+" "+result.responsePreview)
							assert.Equal(t, protocol.endpoint, result.diagnostics.EndpointType)
						} else {
							assert.Nil(t, result.diagnostics)
						}
						require.Len(t, requests, 1)
						request := <-requests
						if protocol.endpoint == "gemini" {
							if stream {
								expectedPath += "streamGenerateContent"
							} else {
								expectedPath += "generateContent"
							}
						}
						assert.True(t, strings.HasPrefix(<-paths, expectedPath))
						if testType == "tool_call" {
							assert.Equal(t, channelTestToolName, gjson.GetBytes(request, protocol.toolPath).String(), string(request))
							assert.GreaterOrEqual(t, gjson.GetBytes(request, protocol.budgetPath).Int(), int64(1024))
							assert.Equal(t, 1, result.diagnostics.ToolCount)
						}
					})
				}
			}
		}
	}
	var logs []model.Log
	require.NoError(t, db.Find(&logs).Error)
	assert.Len(t, logs, 48)
}

func TestChannelProbeImageForwardingAndIncompleteUpstream(t *testing.T) {
	oldDB, oldLogDB, oldRedis := model.DB, model.LOG_DB, common.RedisEnabled
	oldTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.RedisEnabled, constant.StreamingTimeout = oldDB, oldLogDB, oldRedis, oldTimeout
	})
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	user := model.User{Id: 9121, Username: "image-probe", Group: "default", Status: common.UserStatusEnabled, Role: common.RoleRootUser, Quota: 1000000}
	require.NoError(t, db.Create(&user).Error)
	originalRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-4o":1,"gpt-image-2":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalRatios)) })
	tests := []struct {
		name, model, endpoint, body, status, reason string
		stream, upstreamStream                      bool
	}{
		{"image JSON", "gpt-image-2", "image-generation", `{"created":1,"data":[{"b64_json":"aW1hZ2U="}]}`, "passed", "response_validated", false, false},
		{"image SSE", "gpt-image-2", "image-generation", channelProbeSSE(`{"type":"image_generation.completed","b64_json":"aW1hZ2U="}`), "passed", "response_validated", true, true},
		{"image compatibility SSE", "gpt-image-2", "image-generation", `{"created":1,"data":[{"b64_json":"aW1hZ2U="}]}`, "degraded", "compatibility_stream", true, false},
		{"truncated chat before finish", "gpt-4o", "openai", channelProbeSSE(`{"choices":[{"index":0,"delta":{"content":"partial"}}]}`), "failed", "incomplete_stream", true, true},
		{"empty chat stream", "gpt-4o", "openai", channelProbeSSE("[DONE]"), "failed", "", true, true},
		{"late malformed event", "gpt-4o", "openai", channelProbeSSE(`{"choices":[{"index":0,"delta":{"content":"pong"},"finish_reason":"stop"}]}`, "broken-json"), "failed", "", true, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requests := make(chan []byte, 1)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				data, _ := io.ReadAll(r.Body)
				requests <- data
				w.Header().Set("Content-Type", "application/json")
				if tt.upstreamStream {
					w.Header().Set("Content-Type", "text/event-stream")
				}
				_, _ = io.WriteString(w, tt.body)
			}))
			t.Cleanup(upstream.Close)
			channel := &model.Channel{Id: 9122, Type: constant.ChannelTypeOpenAI, Key: "fixture-key", Models: tt.model, Group: "default", Status: common.ChannelStatusEnabled, BaseURL: &upstream.URL}
			if tt.endpoint == "image-generation" {
				channel.ParamOverride = common.GetPointer(`{"n":3}`)
			}
			result := testChannelWithOptions(context.Background(), channel, user.Id, tt.model, tt.endpoint, tt.stream, channelTestOptions{testType: "basic", capturePreview: true, message: "custom basic prompt"})
			require.NotNil(t, result.diagnostics)
			assert.Equal(t, tt.status, result.diagnostics.Status, result.diagnostics.Reason+" "+result.responsePreview)
			if tt.reason != "" {
				assert.Equal(t, tt.reason, result.diagnostics.Reason)
			}
			require.Len(t, requests, 1)
			request := <-requests
			if tt.endpoint == "image-generation" {
				require.NoError(t, result.localErr)
				assert.Equal(t, int64(1), gjson.GetBytes(request, "n").Int())
				assert.Equal(t, "custom basic prompt", gjson.GetBytes(request, "prompt").String())
				assert.Equal(t, tt.stream, gjson.GetBytes(request, "stream").Bool())
			}
		})
	}
}
