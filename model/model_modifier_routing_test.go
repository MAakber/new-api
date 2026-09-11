package model

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestModelModifierChannelSelection(t *testing.T) {
	gemini := model_setting.GetGeminiSettings()
	previousThinking := gemini.ThinkingAdapterEnabled
	gemini.ThinkingAdapterEnabled = true
	t.Cleanup(func() { gemini.ThinkingAdapterEnabled = previousThinking })

	cases := []struct {
		name       string
		request    string
		configured []string
	}{
		{"modifier uses base", "qwen3-max@temperature:0.2", []string{"qwen3-max"}},
		{"exact modifier wins", "qwen3-max@thinking:on", []string{"qwen3-max@thinking:on", "qwen3-max"}},
		{"legacy wildcard wins", "gemini-2.5-flash-thinking-8192", []string{"gemini-2.5-flash-thinking-*", "gemini-2.5-flash"}},
		{"compact uses base", "gpt-4.1-openai-compact", []string{"gpt-4.1"}},
		{"compact alias wins", "gpt-4.1-openai-compact", []string{"gpt-4.1-openai-compact", "gpt-4.1"}},
		{"compact modifier uses alias", "gpt-4.1@effort:high-openai-compact", []string{"gpt-4.1-openai-compact", "gpt-4.1"}},
	}
	for _, cached := range []bool{false, true} {
		for _, tc := range cases {
			t.Run(fmt.Sprintf("cache=%t/%s", cached, tc.name), func(t *testing.T) {
				db := useChannelRequestSelectionDB(t)
				previousGroupCol := commonGroupCol
				commonGroupCol = `"group"`
				t.Cleanup(func() { commonGroupCol = previousGroupCol })
				for index, configured := range tc.configured {
					priority := int64(index + 1)
					channel := Channel{Id: index + 1, Type: constant.ChannelTypeCodexCompatibility, Status: common.ChannelStatusEnabled, Models: configured, Group: "g", Priority: &priority}
					require.NoError(t, db.Create(&channel).Error)
					require.NoError(t, db.Create(&Ability{Group: "g", Model: configured, ChannelId: channel.Id, Enabled: true, Priority: &priority, Weight: 1}).Error)
				}
				common.MemoryCacheEnabled = cached
				if cached {
					InitChannelCache()
				}
				for _, retry := range []int{0, 4} {
					channel, err := GetRandomSatisfiedChannel("g", tc.request, retry, []dto.ChannelFilter{{Kind: dto.FilterRequestPath, RequestPath: "/v1/responses"}})
					require.NoError(t, err)
					require.NotNil(t, channel)
					assert.Equal(t, 1, channel.Id)
					channel, err = GetRandomSatisfiedChannelExcluding("g", tc.request, retry, []dto.ChannelFilter{{Kind: dto.FilterRequestPath, RequestPath: "/v1/responses"}}, nil)
					require.NoError(t, err)
					require.NotNil(t, channel)
					assert.Equal(t, 1, channel.Id)
				}
				assert.True(t, IsChannelEnabledForGroupModel("g", tc.request, 1))
				channel, err := GetRandomSatisfiedChannelExcluding("g", tc.request, 0, []dto.ChannelFilter{{Kind: dto.FilterRequestPath, RequestPath: "/v1/responses"}}, map[int]struct{}{1: {}})
				require.NoError(t, err)
				assert.Nil(t, channel, "excluding the exact candidate must not switch to a differently configured model")
			})
		}
	}
}
