package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUpdateOptionLoginProxyURLPersistsCanonicalValueAndHotUpdates(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })

	common.OptionMapRWMutex.Lock()
	previousOptionMap := common.OptionMap
	common.OptionMap = map[string]string{"LoginProxyURL": ""}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptionMap
		common.OptionMapRWMutex.Unlock()
		_, _ = setting.SetLoginProxyURL("")
	})

	require.NoError(t, UpdateOption("LoginProxyURL", "  HTTP://proxy.example:8080/  "))
	require.Equal(t, "http://proxy.example:8080", setting.GetLoginProxyURL())

	var option Option
	require.NoError(t, db.First(&option, "key = ?", "LoginProxyURL").Error)
	require.Equal(t, "http://proxy.example:8080", option.Value)

	require.Error(t, UpdateOption("LoginProxyURL", "ftp://proxy.example:21"))
	require.Equal(t, "http://proxy.example:8080", setting.GetLoginProxyURL())
	require.NoError(t, db.First(&option, "key = ?", "LoginProxyURL").Error)
	require.Equal(t, "http://proxy.example:8080", option.Value)
}
