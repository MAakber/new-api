package model

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionAutoBanConfigValidatesBeforePersisting(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	defaults, err := json.Marshal(setting.DefaultAutoBanConfig())
	require.NoError(t, err)
	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{"AutoBanConfig": string(defaults)}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		require.NoError(t, setting.UpdateAutoBanConfigByJSONString(string(defaults)))
	})
	require.NoError(t, db.Create(&Option{Key: "AutoBanConfig", Value: string(defaults)}).Error)

	require.Error(t, UpdateOption("AutoBanConfig", `{"unknown":true}`))
	var stored Option
	require.NoError(t, db.First(&stored, "key = ?", "AutoBanConfig").Error)
	require.Equal(t, string(defaults), stored.Value)

	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.UserAgent.Enabled = true
	encoded, err := json.Marshal(config)
	require.NoError(t, err)
	require.NoError(t, UpdateOption("AutoBanConfig", string(encoded)))
	require.True(t, setting.GetAutoBanConfig().Enabled)
	require.True(t, setting.GetAutoBanConfig().UserAgent.Enabled)
}
