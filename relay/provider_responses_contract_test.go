package relay_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/deepseek"
	"github.com/QuantumNous/new-api/relay/channel/ollama"
	"github.com/QuantumNous/new-api/relay/channel/zhipu_4v"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNativeResponsesPreservesExplicitZeroAndConversation(t *testing.T) {
	const body = `{"model":"native-model","input":[{"type":"function_call_output","call_id":"call_1","output":"0"}],"previous_response_id":"resp_1","max_output_tokens":0,"temperature":0,"top_p":0,"stream":false,"store":false,"parallel_tool_calls":false,"reasoning":{"effort":"low"}}`
	tests := []struct {
		name    string
		adaptor channel.Adaptor
		path    string
	}{
		{"deepseek", &deepseek.Adaptor{}, "/responses"},
		{"glm", &zhipu_4v.Adaptor{}, "/api/v1/responses"},
		{"ollama", &ollama.Adaptor{}, "/v1/responses"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(body))
			info := &relaycommon.RelayInfo{
				RelayMode:   relayconstant.RelayModeResponses,
				RelayFormat: types.RelayFormatOpenAIResponses,
				ChannelMeta: &relaycommon.ChannelMeta{ChannelBaseUrl: "https://provider.example.test", UpstreamModelName: "native-model"},
			}
			var request dto.OpenAIResponsesRequest
			require.NoError(t, common.Unmarshal([]byte(body), &request))
			converted, err := tt.adaptor.ConvertOpenAIResponsesRequest(c, info, request)
			require.NoError(t, err)
			encoded, err := common.Marshal(converted)
			require.NoError(t, err)
			assert.JSONEq(t, body, string(encoded))
			url, err := tt.adaptor.GetRequestURL(info)
			require.NoError(t, err)
			assert.Equal(t, "https://provider.example.test"+tt.path, url)
		})
	}
}

func TestDeepSeekResponsesMappedThinkingSuffix(t *testing.T) {
	for _, tt := range []struct{ suffix, effort string }{
		{"-max", "max"},
		{"-none", "none"},
	} {
		t.Run(tt.suffix, func(t *testing.T) {
			info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "deepseek-v4-pro" + tt.suffix}}
			converted, err := (&deepseek.Adaptor{}).ConvertOpenAIResponsesRequest(nil, info, dto.OpenAIResponsesRequest{Model: "customer-model"})
			require.NoError(t, err)
			request, ok := converted.(dto.OpenAIResponsesRequest)
			require.True(t, ok)
			require.NotNil(t, request.Reasoning)
			assert.Equal(t, "deepseek-v4-pro", request.Model)
			assert.Equal(t, tt.effort, request.Reasoning.Effort)
			assert.Equal(t, tt.effort, info.ReasoningEffort)
		})
	}
}
