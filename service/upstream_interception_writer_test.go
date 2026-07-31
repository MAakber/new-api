package service

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestUpstreamInterceptionRemovesMatchAcrossStreamChunks(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionRemove, true, `通知群\s*\d+`, nil)
	c, recorder := newUpstreamInterceptionTestContext()
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 1, true))

	writeOpenAIInterceptionChunk(t, c, "正常回答：通知")
	writeOpenAIInterceptionChunk(t, c, "群114514，继续回答")
	require.Empty(t, recorder.Body.String())
	require.Nil(t, FinishUpstreamInterception(c))

	body := recorder.Body.String()
	require.Contains(t, body, "正常回答：")
	require.Contains(t, body, "，继续回答")
	require.NotContains(t, body, "通知群")
	require.NotContains(t, body, "114514")
}

func TestUpstreamInterceptionBlocksShortStreamBeforeOutputAndAllowsRetry(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionBlock, true, `通知群\s*\d+`, nil)
	c, recorder := newUpstreamInterceptionTestContext()
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 1, true))

	writeOpenAIInterceptionChunk(t, c, "通知群114514")
	err := FinishUpstreamInterception(c)
	require.NotNil(t, err)
	require.True(t, IsUpstreamInterceptionError(err))
	require.True(t, ShouldRetryUpstreamInterception(err))
	require.Empty(t, recorder.Body.String())
}

func TestUpstreamInterceptionEmptyAfterRemovalBecomesBlock(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionRemove, true, `通知群\s*\d+`, nil)
	c, recorder := newUpstreamInterceptionTestContext()
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 1, false))

	_, err := c.Writer.Write([]byte(`{"id":"x","choices":[{"message":{"role":"assistant","content":"通知群114514"}}]}`))
	require.NoError(t, err)
	filterErr := FinishUpstreamInterception(c)
	require.NotNil(t, filterErr)
	require.True(t, ShouldRetryUpstreamInterception(filterErr))
	require.Empty(t, recorder.Body.String())
}

func TestUpstreamInterceptionLateStreamBlockWritesProtocolErrorAndDoesNotRetry(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionBlock, true, `通知群\s*\d+`, nil)
	c, recorder := newUpstreamInterceptionTestContext()
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 1, true))

	for range 6 {
		writeOpenAIInterceptionChunk(t, c, strings.Repeat("a", 120))
	}
	require.NotEmpty(t, recorder.Body.String())
	writeOpenAIInterceptionChunk(t, c, "通知群114514")
	err := FinishUpstreamInterception(c)
	require.NotNil(t, err)
	require.False(t, ShouldRetryUpstreamInterception(err))
	require.True(t, UpstreamInterceptionErrorAlreadyWritten(c))
	require.Contains(t, recorder.Body.String(), "upstream_ad")
	require.NotContains(t, recorder.Body.String(), "通知群")
}

func TestUpstreamInterceptionIgnoresReasoningAndExcludedChannels(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionBlock, false, `通知群\s*\d+`, []int{9})
	c, recorder := newUpstreamInterceptionTestContext()
	require.False(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 9, false))
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 8, false))

	response := `{"choices":[{"message":{"role":"assistant","content":"正常回答","reasoning_content":"通知群114514"}}]}`
	_, err := c.Writer.Write([]byte(response))
	require.NoError(t, err)
	require.Nil(t, FinishUpstreamInterception(c))
	require.JSONEq(t, response, recorder.Body.String())
}

func TestUpstreamInterceptionPassesReasoningOnlyStreamWithoutDelay(t *testing.T) {
	setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionBlock, false, `secret`, nil)
	c, recorder := newUpstreamInterceptionTestContext()
	require.True(t, BeginUpstreamInterception(c, types.RelayFormatOpenAI, 1, true))

	frame := "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"secret\"}}]}\n\n"
	_, err := c.Writer.Write([]byte(frame))
	require.NoError(t, err)
	c.Writer.Flush()

	require.Equal(t, frame, recorder.Body.String())
	require.Nil(t, FinishUpstreamInterception(c))
}

func TestUpstreamInterceptionFiltersVisibleTextAcrossClientProtocols(t *testing.T) {
	tests := []struct {
		name       string
		format     types.RelayFormat
		response   string
		assertBody func(*testing.T, string)
	}{
		{
			name:     "claude",
			format:   types.RelayFormatClaude,
			response: `{"type":"message","content":[{"type":"text","text":"通知群114514"},{"type":"thinking","thinking":"通知群114514"},{"type":"text","text":"正常回答"}]}`,
			assertBody: func(t *testing.T, body string) {
				var response map[string]any
				require.NoError(t, json.Unmarshal([]byte(body), &response))
				content := response["content"].([]any)
				require.Equal(t, "", content[0].(map[string]any)["text"])
				require.Equal(t, "通知群114514", content[1].(map[string]any)["thinking"])
				require.Equal(t, "正常回答", content[2].(map[string]any)["text"])
			},
		},
		{
			name:     "gemini",
			format:   types.RelayFormatGemini,
			response: `{"candidates":[{"content":{"role":"model","parts":[{"text":"通知群114514"},{"text":"通知群114514","thought":true},{"text":"正常回答"}]}}]}`,
			assertBody: func(t *testing.T, body string) {
				var response map[string]any
				require.NoError(t, json.Unmarshal([]byte(body), &response))
				parts := response["candidates"].([]any)[0].(map[string]any)["content"].(map[string]any)["parts"].([]any)
				require.Equal(t, "", parts[0].(map[string]any)["text"])
				require.Equal(t, "通知群114514", parts[1].(map[string]any)["text"])
				require.Equal(t, "正常回答", parts[2].(map[string]any)["text"])
			},
		},
		{
			name:     "responses",
			format:   types.RelayFormatOpenAIResponses,
			response: `{"id":"resp","object":"response","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"通知群114514 正常回答"}]}]}`,
			assertBody: func(t *testing.T, body string) {
				require.NotContains(t, body, "114514")
				require.Contains(t, body, "正常回答")
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setUpstreamInterceptionTestConfig(t, setting.UpstreamInterceptionActionRemove, false, `通知群\s*\d+`, nil)
			c, recorder := newUpstreamInterceptionTestContext()
			require.True(t, BeginUpstreamInterception(c, test.format, 1, false))
			_, err := c.Writer.Write([]byte(test.response))
			require.NoError(t, err)
			require.Nil(t, FinishUpstreamInterception(c))
			test.assertBody(t, recorder.Body.String())
		})
	}
}

func setUpstreamInterceptionTestConfig(t *testing.T, action string, retry bool, expression string, excluded []int) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = setting.SetUpstreamInterceptionConfig(setting.DefaultUpstreamInterceptionConfigJSON())
	})
	config := setting.DefaultUpstreamInterceptionConfig()
	config.Enabled = true
	config.Action = action
	config.RetryOnBlock = retry
	config.ErrorCode = "upstream_ad"
	config.ErrorMessage = "blocked"
	config.ExcludedChannelIDs = excluded
	config.Rules = []setting.UpstreamInterceptionRule{{Name: "group ad", Type: setting.UpstreamInterceptionRuleRegex, Expression: expression, Enabled: true}}
	data, err := json.Marshal(config)
	require.NoError(t, err)
	_, err = setting.SetUpstreamInterceptionConfig(string(data))
	require.NoError(t, err)
}

func newUpstreamInterceptionTestContext() (*gin.Context, *httptest.ResponseRecorder) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	return c, recorder
}

func writeOpenAIInterceptionChunk(t *testing.T, c *gin.Context, content string) {
	t.Helper()
	payload, err := json.Marshal(map[string]any{
		"id":     "chatcmpl-test",
		"object": "chat.completion.chunk",
		"choices": []any{map[string]any{
			"index": 0,
			"delta": map[string]any{"content": content},
		}},
	})
	require.NoError(t, err)
	_, err = c.Writer.Write([]byte(fmt.Sprintf("data: %s\n\n", payload)))
	require.NoError(t, err)
	c.Writer.Flush()
}
