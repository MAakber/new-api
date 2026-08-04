package operation_setting

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetMonitorSetting_ChannelTestEnabledEnvOverridesEnabledConfig(t *testing.T) {
	orig := monitorSetting
	t.Cleanup(func() { monitorSetting = orig })

	t.Setenv("CHANNEL_TEST_ENABLED", "false")
	t.Setenv("CHANNEL_TEST_FREQUENCY", "5")
	monitorSetting = MonitorSetting{
		AutoTestChannelEnabled: true,
		AutoTestChannelMinutes: 20,
	}

	setting := GetMonitorSetting()

	require.NotNil(t, setting)
	assert.False(t, setting.AutoTestChannelEnabled)
	assert.Equal(t, float64(5), setting.AutoTestChannelMinutes)
}

func TestMonitorSettingChannelTestDefaults(t *testing.T) {
	setting := defaultMonitorSetting()

	assert.Equal(t, DefaultChannelTestMessage, setting.ChannelTestMessage)
	assert.True(t, setting.ChannelTestUseChannelStyle)
	assert.False(t, setting.ChannelTestShowResponsePreview)
}

func TestNormalizeChannelTestMessage(t *testing.T) {
	message, err := NormalizeChannelTestMessage("  hello  ")
	require.NoError(t, err)
	assert.Equal(t, "hello", message)

	message, err = NormalizeChannelTestMessage("   ")
	require.NoError(t, err)
	assert.Empty(t, message)

	_, err = NormalizeChannelTestMessage(strings.Repeat("界", ChannelTestMessageMaxRunes+1))
	require.ErrorContains(t, err, "must not exceed")
}

func TestGetMonitorSetting_ChannelTestEnabledEnvCanEnableDisabledConfig(t *testing.T) {
	orig := monitorSetting
	t.Cleanup(func() { monitorSetting = orig })

	t.Setenv("CHANNEL_TEST_ENABLED", "true")
	monitorSetting = MonitorSetting{
		AutoTestChannelEnabled: false,
		AutoTestChannelMinutes: 12,
	}

	setting := GetMonitorSetting()

	require.NotNil(t, setting)
	assert.True(t, setting.AutoTestChannelEnabled)
	assert.Equal(t, float64(12), setting.AutoTestChannelMinutes)
}
