package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/stretchr/testify/assert"
)

func TestCodeBuddyResponsesNeverPassThroughRequestBody(t *testing.T) {
	original := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	t.Cleanup(func() { model_setting.GetGlobalSettings().PassThroughRequestEnabled = original })
	model_setting.GetGlobalSettings().PassThroughRequestEnabled = false

	codeBuddy := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelType:    constant.ChannelTypeCodeBuddy,
		ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true},
	}}
	openAI := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{
		ChannelType:    constant.ChannelTypeOpenAI,
		ChannelSetting: dto.ChannelSettings{PassThroughBodyEnabled: true},
	}}

	assert.False(t, shouldPassThroughResponsesBody(codeBuddy))
	assert.True(t, shouldPassThroughResponsesBody(openAI))

	codeBuddy.ChannelSetting.PassThroughBodyEnabled = false
	openAI.ChannelSetting.PassThroughBodyEnabled = false
	model_setting.GetGlobalSettings().PassThroughRequestEnabled = true
	assert.False(t, shouldPassThroughResponsesBody(codeBuddy))
	assert.True(t, shouldPassThroughResponsesBody(openAI))
}

func TestCodexCompatibilityChannelTestResponsesNeverPassesThroughBody(t *testing.T) {
	original := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	t.Cleanup(func() { model_setting.GetGlobalSettings().PassThroughRequestEnabled = original })

	info := &relaycommon.RelayInfo{
		RelayMode:     relayconstant.RelayModeResponses,
		IsChannelTest: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeCodexCompatibility,
			ChannelSetting: dto.ChannelSettings{
				PassThroughBodyEnabled: true,
			},
		},
	}

	assert.False(t, shouldPassThroughResponsesBody(info))

	info.ChannelSetting.PassThroughBodyEnabled = false
	model_setting.GetGlobalSettings().PassThroughRequestEnabled = true
	assert.False(t, shouldPassThroughResponsesBody(info))

	info.DisableChannelTestClientProfile = true
	assert.True(t, shouldPassThroughResponsesBody(info))

	info.IsChannelTest = false
	info.DisableChannelTestClientProfile = false
	assert.True(t, shouldPassThroughResponsesBody(info))
}
