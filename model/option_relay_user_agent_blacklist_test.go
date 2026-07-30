package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionRelayUserAgentBlacklistValidatesBeforePersisting(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{
		"RelayUserAgentBlacklistEnabled": "true",
		"RelayUserAgentBlacklist":        "^old-client$",
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		_, _ = common.SetRelayUserAgentBlacklistConfig(false, "")
	})
	_, err = common.SetRelayUserAgentBlacklistConfig(true, "^old-client$")
	require.NoError(t, err)
	require.NoError(t, db.Create(&Option{Key: "RelayUserAgentBlacklist", Value: "^old-client$"}).Error)

	err = UpdateOption("RelayUserAgentBlacklist", "[")
	require.Error(t, err)
	require.True(t, common.IsRelayUserAgentBlacklisted("old-client"))

	var option Option
	require.NoError(t, db.First(&option, "key = ?", "RelayUserAgentBlacklist").Error)
	require.Equal(t, "^old-client$", option.Value)

	require.NoError(t, UpdateOption("RelayUserAgentBlacklist", "  ^new-client$\r\n\n^new-client$  "))
	require.True(t, common.IsRelayUserAgentBlacklisted("new-client"))
	require.False(t, common.IsRelayUserAgentBlacklisted("old-client"))
	require.NoError(t, db.First(&option, "key = ?", "RelayUserAgentBlacklist").Error)
	require.Equal(t, "^new-client$", option.Value)
}
