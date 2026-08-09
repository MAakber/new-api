package model

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUserRequestRateLimitOptionsPersistAndUpdateRuntime(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))

	previousDB := DB
	previousOptionMap := common.OptionMap
	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	DB = db
	common.OptionMapRWMutex.Lock()
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		DB = previousDB
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	require.NoError(t, UpdateOption(setting.UserRequestRateLimitEnabledOptionKey, "true"))
	require.NoError(t, UpdateOption(setting.UserRequestRateLimitDefaultOptionKey, "120"))
	assert.True(t, setting.UserRequestRateLimitEnabled)
	assert.Equal(t, 120, setting.UserRequestRateLimitDefault)

	var stored Option
	require.NoError(t, db.First(&stored, "key = ?", setting.UserRequestRateLimitDefaultOptionKey).Error)
	assert.Equal(t, "120", stored.Value)

	require.Error(t, UpdateOption(setting.UserRequestRateLimitDefaultOptionKey, "0"))
	require.Error(t, updateOptionMap(setting.UserRequestRateLimitDefaultOptionKey, "0"))
	assert.Equal(t, 120, setting.UserRequestRateLimitDefault)

	require.Error(t, UpdateOption(setting.UserRequestRateLimitDefaultOptionKey, strconv.Itoa(setting.MaxUserRequestsPerMinute+1)))
	require.NoError(t, db.First(&stored, "key = ?", setting.UserRequestRateLimitDefaultOptionKey).Error)
	assert.Equal(t, "120", stored.Value)
}
