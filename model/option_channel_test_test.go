package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateChannelTestOptionsValidatesAndHotUpdates(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	setting := operation_setting.GetMonitorSetting()
	previousSetting := *setting
	t.Cleanup(func() { *setting = previousSetting })

	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
	})

	require.NoError(t, UpdateOption(operation_setting.ChannelTestMessageOptionKey, "  probe  "))
	assert.Equal(t, "probe", operation_setting.GetMonitorSetting().ChannelTestMessage)

	require.Error(t, UpdateOption(
		operation_setting.ChannelTestMessageOptionKey,
		strings.Repeat("x", operation_setting.ChannelTestMessageMaxRunes+1),
	))
	require.Error(t, UpdateOption(operation_setting.ChannelTestUseChannelStyleOptionKey, "not-a-bool"))

	require.NoError(t, UpdateOption(operation_setting.ChannelTestUseChannelStyleOptionKey, "false"))
	assert.False(t, operation_setting.GetMonitorSetting().ChannelTestUseChannelStyle)
	require.NoError(t, UpdateOption(operation_setting.ChannelTestShowResponsePreviewOptionKey, "true"))
	assert.True(t, operation_setting.GetMonitorSetting().ChannelTestShowResponsePreview)
}
