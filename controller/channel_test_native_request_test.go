package controller

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestNativeChannelTestRequestBudgetAndMessage(t *testing.T) {
	for _, endpoint := range []string{"anthropic", "gemini"} {
		for _, stream := range []bool{false, true} {
			t.Run(endpoint+map[bool]string{false: "/json", true: "/stream"}[stream], func(t *testing.T) {
				request := buildTestRequestWithMessage("probe-model", endpoint, &model.Channel{}, stream, "configured probe", "")
				path := "/v1/messages"
				messagePath, budgetPath := "messages.0.content", "max_tokens"
				budget := int64(16)
				if endpoint == "gemini" {
					require.IsType(t, &dto.GeminiChatRequest{}, request)
					messagePath, budgetPath, budget = "contents.0.parts.0.text", "generationConfig.maxOutputTokens", 3000
					path = "/v1beta/models/probe-model:generateContent"
					if stream {
						path = "/v1beta/models/probe-model:streamGenerateContent"
					}
				} else {
					require.IsType(t, &dto.ClaudeRequest{}, request)
				}
				data, err := common.Marshal(request)
				require.NoError(t, err)
				assert.Equal(t, "configured probe", gjson.GetBytes(data, messagePath).String())
				assert.Equal(t, budget, gjson.GetBytes(data, budgetPath).Int())
				assert.Equal(t, stream, request.IsStream(httptest.NewRequest("POST", path, nil)))
				applyTestRequestMaxTokens(request, 8)
				data, err = common.Marshal(request)
				require.NoError(t, err)
				assert.Equal(t, int64(8), gjson.GetBytes(data, budgetPath).Int(), "queue warm-up must cap native output")
			})
		}
	}
}
