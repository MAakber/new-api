package ollama

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestOllamaChatPreservesThinkingToolContextAndNonStream(t *testing.T) {
	var request dto.GeneralOpenAIRequest
	require.NoError(t, common.Unmarshal([]byte(`{"model":"qwen3","stream":false,"temperature":0,"reasoning":{"effort":"high"},"messages":[{"role":"assistant","content":"","reasoning_content":"Use the weather tool","tool_calls":[{"id":"call_weather","type":"function","function":{"name":"weather","arguments":"{\"days\":0}"}}]},{"role":"tool","tool_call_id":"call_weather","content":"sunny"}],"response_format":{"type":"json_schema","json_schema":{"name":"weather","schema":{"type":"object","properties":{"weather":{"type":"string"}}}}}}`), &request))
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	converted, err := (&Adaptor{}).ConvertOpenAIRequest(c, &relaycommon.RelayInfo{}, &request)
	require.NoError(t, err)
	encoded, err := common.Marshal(converted)
	require.NoError(t, err)
	body := gjson.ParseBytes(encoded)
	assert.Equal(t, "false", body.Get("stream").Raw)
	assert.Equal(t, "0", body.Get("options.temperature").Raw)
	assert.Equal(t, "high", body.Get("think").String())
	assert.Equal(t, "Use the weather tool", body.Get("messages.0.thinking").String())
	assert.Equal(t, "call_weather", body.Get("messages.0.tool_calls.0.id").String())
	assert.Equal(t, "0", body.Get("messages.0.tool_calls.0.function.arguments.days").Raw)
	assert.Equal(t, "call_weather", body.Get("messages.1.tool_call_id").String())
	assert.Equal(t, "weather", body.Get("messages.1.tool_name").String())
	assert.JSONEq(t, `{"type":"object","properties":{"weather":{"type":"string"}}}`, body.Get("format").Raw)
}
