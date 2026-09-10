package helper

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompactModifiersRetainMappingPriceAndRetryIdentity(t *testing.T) {
	savedPrices := ratio_setting.ModelPrice2JSONString()
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(savedPrices)) })
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"gpt-4.1-openai-compact":0.002,"*-openai-compact":0.005,"gpt-4.1":0.01}`))

	const origin = "public@effort:high@temperature:0.2-openai-compact"
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/responses/compact", nil)
	c.Set("model_mapping", `{"public":"gpt-4.1"}`)
	common.SetContextKey(c, constant.ContextKeyOriginalModel, origin)
	common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeCodexCompatibility)
	info := &relaycommon.RelayInfo{
		OriginModelName: origin,
		RelayMode:       relayconstant.RelayModeResponsesCompact,
		Request:         &dto.OpenAIResponsesCompactionRequest{Model: origin},
		UserGroup:       "default",
		UsingGroup:      "default",
	}
	for attempt := 0; attempt < 2; attempt++ {
		info.InitChannelMeta(c)
		request := &dto.OpenAIResponsesRequest{Model: origin}
		require.NoError(t, ModelMappedHelper(c, info, request))
		require.NoError(t, ApplyReasoningModelSuffix(c, info, request))
		assert.Equal(t, origin, info.OriginModelName)
		assert.Equal(t, "gpt-4.1", request.Model)
		require.NotNil(t, request.Reasoning)
		assert.Equal(t, "high", request.Reasoning.Effort)
		require.NotNil(t, request.Temperature)
		assert.Equal(t, 0.2, *request.Temperature)
		price, err := ModelPriceHelper(c, info, 100, &types.TokenCountMeta{})
		require.NoError(t, err)
		assert.Equal(t, "gpt-4.1-openai-compact", info.GetBillingModelName())
		assert.Equal(t, 0.002, price.ModelPrice)
		assert.Equal(t, 1000, price.QuotaToPreConsume)
	}
}
