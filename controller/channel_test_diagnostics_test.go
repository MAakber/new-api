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
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func channelProbeSSE(events ...string) string {
	return "data: " + strings.Join(events, "\n\ndata: ") + "\n\n"
}

func TestChannelProbeValidatesProtocolResults(t *testing.T) {
	tests := []struct {
		name, endpoint, kind, body, status, reason string
		stream, compatibility                      bool
	}{
		{"chat text", "openai", "basic", `{"choices":[{"message":{"content":"pong"},"finish_reason":"stop"}]}`, "passed", "response_validated", false, false},
		{"chat empty", "openai", "basic", `{"choices":[]}`, "failed", "empty_output", false, false},
		{"empty body", "openai", "basic", "", "failed", "empty_response", false, false},
		{"malformed body", "openai", "basic", "<html>bad gateway</html>", "failed", "invalid_json", false, false},
		{"error in 200", "openai", "basic", `{"error":{"message":"rate limit"}}`, "failed", "upstream_error", false, false},
		{"output limit", "openai", "basic", `{"choices":[{"message":{"content":"partial"},"finish_reason":"length"}]}`, "failed", "output_incomplete", false, false},
		{"chat stream", "openai", "basic", channelProbeSSE(`{"choices":[{"delta":{"content":"pong"}}]}`, `{"choices":[{"delta":{},"finish_reason":"stop"}]}`, "[DONE]"), "passed", "response_validated", true, false},
		{"stream missing completion", "openai", "basic", channelProbeSSE(`{"choices":[{"delta":{"content":"partial"}}]}`), "failed", "incomplete_stream", true, false},
		{"done alone", "openai", "basic", channelProbeSSE("[DONE]"), "failed", "invalid_stream", true, false},
		{"keepalive alone", "openai", "basic", ": ping\n\n", "failed", "invalid_stream", true, false},
		{"JSON instead of SSE", "openai", "basic", `{"choices":[{"message":{"content":"pong"}}]}`, "failed", "invalid_stream", true, false},
		{"responses text", "openai-response", "basic", `{"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"pong"}]}]}`, "passed", "response_validated", false, false},
		{"responses stream", "openai-response", "basic", channelProbeSSE(`{"type":"response.output_text.delta","delta":"pong"}`, `{"type":"response.completed","response":{"status":"completed"}}`), "passed", "response_validated", true, false},
		{"responses interrupted", "openai-response", "basic", channelProbeSSE(`{"type":"response.output_text.delta","delta":"pong"}`, `{"type":"response.incomplete"}`), "failed", "output_incomplete", true, false},
		{"Claude text", "anthropic", "basic", `{"content":[{"type":"text","text":"pong"}],"stop_reason":"end_turn"}`, "passed", "response_validated", false, false},
		{"Claude stream", "anthropic", "basic", channelProbeSSE(`{"type":"content_block_delta","delta":{"type":"text_delta","text":"pong"}}`, `{"type":"message_stop"}`), "passed", "response_validated", true, false},
		{"Gemini text", "gemini", "basic", `{"candidates":[{"content":{"parts":[{"text":"pong"}]},"finishReason":"STOP"}]}`, "passed", "response_validated", false, false},
		{"Gemini stream", "gemini", "basic", channelProbeSSE(`{"candidates":[{"content":{"parts":[{"text":"pong"}]},"finishReason":"STOP"}]}`), "passed", "response_validated", true, false},
		{"image JSON", "image-generation", "basic", `{"data":[{"url":"https://example.com/image.png"}]}`, "passed", "response_validated", false, false},
		{"image empty", "image-generation", "basic", `{"data":[]}`, "failed", "empty_output", false, false},
		{"invalid image base64", "image-generation", "basic", `{"data":[{"b64_json":"not base64!"}]}`, "failed", "empty_output", false, false},
		{"responses not complete", "openai-response", "basic", `{"status":"in_progress","output":[{"type":"message","content":[{"type":"output_text","text":"partial"}]}]}`, "failed", "output_incomplete", false, false},
		{"late error event without data", "openai", "basic", channelProbeSSE(`{"choices":[{"delta":{"content":"pong"},"finish_reason":"stop"}]}`) + "event: error\n\n", "failed", "upstream_error", true, false},
		{"image completed", "image-generation", "basic", channelProbeSSE(`{"type":"image_generation.completed","b64_json":"aW1hZ2U="}`), "passed", "response_validated", true, false},
		{"image compatibility", "image-generation", "basic", channelProbeSSE(`{"type":"image_generation.completed","b64_json":"aW1hZ2U="}`, "[DONE]"), "degraded", "compatibility_stream", true, true},
		{"image partial only", "image-generation", "basic", channelProbeSSE(`{"type":"image_generation.partial_image","b64_json":"aW1hZ2U="}`, "[DONE]"), "failed", "incomplete_stream", true, false},
		{"embedding result", "embeddings", "basic", `{"data":[{"embedding":[0.1,0.2]}]}`, "passed", "response_validated", false, false},
		{"rerank result", "jina-rerank", "basic", `{"results":[{"index":0,"relevance_score":0.9}]}`, "passed", "response_validated", false, false},
		{"compaction result", "openai-response-compact", "basic", `{"output":[{"type":"compaction","encrypted_content":"compact"}]}`, "passed", "response_validated", false, false},
		{"tool not triggered", "openai", "tool_call", `{"choices":[{"message":{"content":"hello"},"finish_reason":"stop"}]}`, "failed", "tool_not_called", false, false},
		{"tool arguments invalid", "openai", "tool_call", `{"choices":[{"message":{"tool_calls":[{"function":{"name":"channel_test_echo","arguments":"{\"message\":123}"}}]}}]}`, "failed", "invalid_tool_arguments", false, false},
		{"tool wrong name", "openai", "tool_call", `{"choices":[{"message":{"tool_calls":[{"function":{"name":"other_tool","arguments":"{\"message\":\"ping\"}"}}]}}]}`, "failed", "unexpected_tool", false, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := &channelTestDiagnostics{EndpointType: tt.endpoint, TestType: tt.kind, RequestedStream: tt.stream, UpstreamStream: common.GetPointer(!tt.compatibility)}
			validateChannelProbeResponse([]byte(tt.body), d, nil)
			assert.Equal(t, tt.status, d.Status)
			assert.Equal(t, tt.reason, d.Reason)
		})
	}
}

func TestChannelProbeMergesToolArgumentsAcrossProtocols(t *testing.T) {
	tests := []struct {
		name, endpoint, body string
		stream               bool
	}{
		{"chat JSON", "openai", `{"choices":[{"message":{"tool_calls":[{"id":"call-1","function":{"name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}}]},"finish_reason":"tool_calls"}]}`, false},
		{"chat fragments", "openai", channelProbeSSE(`{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","function":{"name":"channel_test_echo","arguments":"{\"mess"}}]}}]}`, `{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"age\":\"ping\"}"}}]},"finish_reason":"tool_calls"}]}`), true},
		{"responses JSON", "openai-response", `{"status":"completed","output":[{"id":"item-1","type":"function_call","name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}]}`, false},
		{"responses fragments", "openai-response", channelProbeSSE(`{"type":"response.output_item.added","output_index":0,"item":{"id":"item-1","type":"function_call","name":"channel_test_echo","arguments":""}}`, `{"type":"response.function_call_arguments.delta","item_id":"item-1","delta":"{\"message\":"}`, `{"type":"response.function_call_arguments.delta","item_id":"item-1","delta":"\"ping\"}"}`, `{"type":"response.completed","response":{"status":"completed"}}`), true},
		{"Claude JSON", "anthropic", `{"content":[{"type":"tool_use","id":"call-1","name":"channel_test_echo","input":{"message":"ping"}}],"stop_reason":"tool_use"}`, false},
		{"Claude fragments", "anthropic", channelProbeSSE(`{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-1","name":"channel_test_echo","input":{}}}`, `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"message\":"}}`, `{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"ping\"}"}}`, `{"type":"message_stop"}`), true},
		{"Gemini JSON", "gemini", `{"candidates":[{"content":{"parts":[{"functionCall":{"name":"channel_test_echo","args":{"message":"ping"}}}]},"finishReason":"STOP"}]}`, false},
		{"Gemini stream", "gemini", channelProbeSSE(`{"candidates":[{"content":{"parts":[{"functionCall":{"name":"channel_test_echo","args":{"message":"ping"}}}]},"finishReason":"STOP"}]}`), true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			d := &channelTestDiagnostics{EndpointType: tt.endpoint, TestType: "tool_call", RequestedStream: tt.stream, UpstreamStream: common.GetPointer(true)}
			validateChannelProbeResponse([]byte(tt.body), d, nil)
			assert.Equal(t, "passed", d.Status)
			assert.Equal(t, "tool_validated", d.Reason)
			require.NotNil(t, d.ToolNameValid)
			assert.True(t, *d.ToolNameValid)
			require.NotNil(t, d.ToolArgumentsValid)
			assert.True(t, *d.ToolArgumentsValid)
			assert.Equal(t, 1, d.ToolCount)
		})
	}
}

func TestChannelProbeRejectsLateErrorsAndAbnormalStreamEnd(t *testing.T) {
	valid := channelProbeSSE(`{"choices":[{"delta":{"content":"pong"},"finish_reason":"stop"}]}`)
	lateError := valid + ":" + strings.Repeat("x", 9000) + "\n\n" + channelProbeSSE(`{"error":{"message":"late failure"}}`)
	d := &channelTestDiagnostics{EndpointType: "openai", TestType: "basic", RequestedStream: true}
	validateChannelProbeResponse([]byte(lateError), d, nil)
	assert.Equal(t, "failed", d.Status)
	assert.Equal(t, "upstream_error", d.Reason)

	status := relaycommon.NewStreamStatus()
	status.SetEndReason(relaycommon.StreamEndReasonTimeout, context.DeadlineExceeded)
	validateChannelProbeResponse([]byte(valid), d, status)
	assert.Equal(t, "failed", d.Status)
	assert.Equal(t, "stream_timeout", d.Reason)
}

func TestChannelProbeDoesNotMergeDifferentToolCalls(t *testing.T) {
	body := `{"choices":[{"message":{"tool_calls":[{"id":"a","function":{"name":"wrong","arguments":"{\"message\":\"ping\"}"}},{"id":"b","function":{"name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}}]}}]}`
	d := &channelTestDiagnostics{EndpointType: "openai", TestType: "tool_call"}
	validateChannelProbeResponse([]byte(body), d, nil)
	assert.Equal(t, 2, d.ToolCount)
	assert.Equal(t, "unexpected_tool", d.Reason)
}

func TestChannelProbeResolvesAliasesAndApplicableTests(t *testing.T) {
	mapping := `{"image-alias":"gpt-image-2"}`
	channel := &model.Channel{Type: constant.ChannelTypeOpenAI, ModelMapping: &mapping}
	endpoint, err := resolveChannelProbeEndpoint(channel, "image-alias", "auto")
	require.NoError(t, err)
	assert.Equal(t, "image-generation", endpoint)
	assert.True(t, channelProbeNotApplicable(endpoint, "tool_call", false))
	assert.False(t, channelProbeNotApplicable(endpoint, "basic", true))
	assert.True(t, channelProbeNotApplicable("embeddings", "basic", true))
	endpoint, err = resolveChannelProbeEndpoint(channel, "image-alias", "openai-response")
	require.NoError(t, err)
	assert.Equal(t, "openai-response", endpoint)
}

func TestChannelProbeToolRequestPreservesModelBudget(t *testing.T) {
	for _, endpoint := range []string{"openai", "openai-response", "anthropic", "gemini"} {
		t.Run(endpoint, func(t *testing.T) {
			request := buildTestRequestWithMessage("gpt-4o", endpoint, &model.Channel{Type: constant.ChannelTypeOpenAI}, true, "custom message", "")
			require.NoError(t, configureChannelProbeRequest(request, "tool_call", true, "custom message"))
			data, err := common.Marshal(request)
			require.NoError(t, err)
			if endpoint != "gemini" {
				assert.True(t, gjson.GetBytes(data, "stream").Bool())
			}
			switch endpoint {
			case "openai-response":
				assert.Equal(t, channelTestToolName, gjson.GetBytes(data, "tools.0.name").String())
				assert.GreaterOrEqual(t, gjson.GetBytes(data, "max_output_tokens").Int(), int64(1024))
			case "anthropic":
				assert.Equal(t, channelTestToolName, gjson.GetBytes(data, "tools.0.name").String())
				assert.GreaterOrEqual(t, gjson.GetBytes(data, "max_tokens").Int(), int64(1024))
			case "gemini":
				assert.Equal(t, channelTestToolName, gjson.GetBytes(data, "tools.0.functionDeclarations.0.name").String())
				assert.Equal(t, int64(3000), gjson.GetBytes(data, "generationConfig.maxOutputTokens").Int())
			default:
				assert.Equal(t, channelTestToolName, gjson.GetBytes(data, "tools.0.function.name").String())
				assert.GreaterOrEqual(t, gjson.GetBytes(data, "max_tokens").Int(), int64(1024))
			}
			assert.NotContains(t, string(data), "custom message")
		})
	}
	for _, test := range []struct {
		model      string
		budget     uint
		completion bool
	}{
		{"gemini-2.5-flash", 3000, false},
		{"o3", 1024, true},
	} {
		request := buildTestRequestWithMessage(test.model, "openai", &model.Channel{Type: constant.ChannelTypeOpenAI}, false, "", "")
		require.NoError(t, configureChannelProbeRequest(request, "tool_call", false, ""))
		general, ok := request.(*dto.GeneralOpenAIRequest)
		require.True(t, ok)
		if test.completion {
			require.NotNil(t, general.MaxCompletionTokens)
			assert.Equal(t, test.budget, *general.MaxCompletionTokens)
			assert.Nil(t, general.MaxTokens)
		} else {
			require.NotNil(t, general.MaxTokens)
			assert.Equal(t, test.budget, *general.MaxTokens)
		}
	}
}

func TestChannelProbeRejectsInvalidTypeBeforeChannelLookup(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/channel/test/1", strings.NewReader(`{"test_type":"unknown"}`))
	TestChannelDetailed(c)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestChannelProbeUsesRealRelayAndReturnsFullPreview(t *testing.T) {
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldRedis := common.RedisEnabled
	oldStreamingTimeout := constant.StreamingTimeout
	constant.StreamingTimeout = 30
	t.Cleanup(func() { constant.StreamingTimeout = oldStreamingTimeout })
	t.Cleanup(func() { model.DB, model.LOG_DB, common.RedisEnabled = oldDB, oldLogDB, oldRedis })
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	user := model.User{Id: 9101, Username: "probe-user", Group: "default", Status: common.UserStatusEnabled, Role: common.RoleRootUser, Quota: 1000000}
	require.NoError(t, db.Create(&user).Error)
	originalRatios := ratio_setting.ModelRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"gpt-4o":1}`))
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalRatios)) })
	response := channelProbeSSE(
		`{"choices":[{"index":0,"delta":{"content":"`+strings.Repeat("x", 9000)+`"}}]}`,
		`{"id":"chat-1","object":"chat.completion.chunk","model":"gpt-4o","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}}]},"finish_reason":"tool_calls"}]}`,
		`{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":8,"total_tokens":18}}`, "[DONE]",
	)
	requests := make(chan []byte, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		requests <- body
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = io.WriteString(w, response)
	}))
	t.Cleanup(upstream.Close)
	channel := &model.Channel{Id: 9102, Type: constant.ChannelTypeOpenAI, Key: "probe-key", Models: "gpt-4o", Group: "default", Status: common.ChannelStatusEnabled, BaseURL: &upstream.URL}
	result := testChannelWithOptions(context.Background(), channel, user.Id, "gpt-4o", "openai", true, channelTestOptions{testType: "tool_call", capturePreview: true})
	require.NoError(t, result.localErr)
	require.Nil(t, result.newAPIError)
	require.NotNil(t, result.diagnostics)
	assert.Equal(t, "passed", result.diagnostics.Status)
	assert.Equal(t, "tool_validated", result.diagnostics.Reason)
	assert.NotEmpty(t, result.responsePreview)
	assert.False(t, result.previewTruncated)
	assert.Greater(t, len(result.responsePreview), 9000)
	assert.Contains(t, result.responsePreview, channelTestToolName)
	assert.Contains(t, result.responsePreview, "[DONE]")
	requestBody := <-requests
	assert.Equal(t, channelTestToolName, gjson.GetBytes(requestBody, "tools.0.function.name").String())
	assert.True(t, gjson.GetBytes(requestBody, "stream").Bool())
	var logs []model.Log
	require.NoError(t, db.Find(&logs).Error)
	require.Len(t, logs, 1)
	assert.Equal(t, user.Id, logs[0].UserId)
	assert.True(t, logs[0].IsStream)

	// Skipped capability checks must stop before authentication and any upstream I/O.
	skipped := testChannelWithOptions(context.Background(), channel, 0, "gpt-image-2", "", false, channelTestOptions{testType: "tool_call"})
	require.NoError(t, skipped.localErr)
	require.NotNil(t, skipped.diagnostics)
	assert.Equal(t, "skipped", skipped.diagnostics.Status)
	assert.Empty(t, skipped.responsePreview)
	assert.Empty(t, requests)

}

func TestChannelProbeRedactsCompleteSSEPreview(t *testing.T) {
	preview := sanitizeChannelTestResponsePreview([]byte(channelProbeSSE(
		`{"choices":[{"delta":{"content":"pong"}}],"headers":{"cookie":"private-cookie"},"metadata":{"secret":"private-metadata"},"api_key":"private-key"}`,
		"[DONE]",
	)))
	assert.NotContains(t, preview, "private-")
	assert.Contains(t, preview, "pong")
	assert.Contains(t, preview, "[DONE]")
	assert.Contains(t, preview, "[REDACTED]")
}

func TestChannelProbeKeepsToolIDsSeparateAndAcceptsMixedIDIndexFragments(t *testing.T) {
	response := channelProbeSSE(
		`{"choices":[{"index":0,"delta":{"tool_calls":[{"id":"a","function":{"name":"other","arguments":"{\"message\":\"ping\"}"}},{"id":"b","function":{"name":"channel_test_echo","arguments":"{\"message\":\"ping\"}"}}]}}]}`,
		"[DONE]",
	)
	d := &channelTestDiagnostics{EndpointType: "openai", TestType: "tool_call", RequestedStream: true}
	validateChannelProbeResponse([]byte(response), d, nil)
	assert.Equal(t, 2, d.ToolCount)
	assert.Equal(t, "unexpected_tool", d.Reason)

	response = channelProbeSSE(
		`{"type":"response.output_item.added","output_index":0,"item":{"id":"item-a","type":"function_call","name":"channel_test_echo","arguments":""}}`,
		`{"type":"response.function_call_arguments.delta","output_index":0,"delta":"{\"message\":"}`,
		`{"type":"response.function_call_arguments.delta","item_id":"item-a","delta":"\"ping\"}"}`,
		`{"type":"response.completed","response":{"status":"completed"}}`,
	)
	d = &channelTestDiagnostics{EndpointType: "openai-response", TestType: "tool_call", RequestedStream: true}
	validateChannelProbeResponse([]byte(response), d, nil)
	assert.Equal(t, "passed", d.Status)
	assert.Equal(t, 1, d.ToolCount)
}
