package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionUpstreamInterceptionValidatesBeforePersisting(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	oldValue := `{"enabled":true,"action":"block","retry_on_block":true,"error_status":502,"error_code":"blocked","error_message":"blocked","excluded_channel_ids":[],"rules":[{"name":"old","type":"keyword","expression":"old-ad","enabled":true}]}`
	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{setting.UpstreamInterceptionOptionKey: oldValue}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		_, _ = setting.SetUpstreamInterceptionConfig(setting.DefaultUpstreamInterceptionConfigJSON())
	})

	_, err = setting.SetUpstreamInterceptionConfig(oldValue)
	require.NoError(t, err)
	require.NoError(t, db.Create(&Option{Key: setting.UpstreamInterceptionOptionKey, Value: oldValue}).Error)

	invalidValue := `{"enabled":true,"action":"block","retry_on_block":true,"error_status":502,"error_code":"blocked","error_message":"blocked","excluded_channel_ids":[],"rules":[{"name":"bad","type":"regex","expression":".*","enabled":true}]}`
	err = UpdateOption(setting.UpstreamInterceptionOptionKey, invalidValue)
	require.Error(t, err)
	require.NotEmpty(t, setting.GetUpstreamInterceptionSnapshot(1).FindMatches("old-ad"))

	var option Option
	require.NoError(t, db.First(&option, "key = ?", setting.UpstreamInterceptionOptionKey).Error)
	require.Equal(t, oldValue, option.Value)

	newValue := `{"enabled":true,"action":"remove","retry_on_block":false,"error_status":451,"error_code":"new_block","error_message":"new block","excluded_channel_ids":[3,2,3],"rules":[{"name":"new","type":"keyword","expression":"new-ad","enabled":true}]}`
	require.NoError(t, UpdateOption(setting.UpstreamInterceptionOptionKey, newValue))
	require.NotEmpty(t, setting.GetUpstreamInterceptionSnapshot(1).FindMatches("new-ad"))
	require.Empty(t, setting.GetUpstreamInterceptionSnapshot(1).FindMatches("old-ad"))
	require.Nil(t, setting.GetUpstreamInterceptionSnapshot(2))
	require.Nil(t, setting.GetUpstreamInterceptionSnapshot(3))

	normalized, err := setting.ValidateAndNormalizeUpstreamInterceptionConfigJSON(newValue)
	require.NoError(t, err)
	require.NoError(t, db.First(&option, "key = ?", setting.UpstreamInterceptionOptionKey).Error)
	require.Equal(t, normalized, option.Value)
}
