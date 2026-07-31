package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useChannelRequestSelectionDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousCache := common.MemoryCacheEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	DB = db
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		DB = previousDB
		common.MemoryCacheEnabled = previousCache
	})
	return db
}

func TestGetChannelExcludingClampsRetryToLowestPriority(t *testing.T) {
	db := useChannelRequestSelectionDB(t)
	high, low := int64(10), int64(1)
	channels := []Channel{{Id: 1, Status: common.ChannelStatusEnabled}, {Id: 2, Status: common.ChannelStatusEnabled}}
	require.NoError(t, db.Create(&channels).Error)
	require.NoError(t, db.Create(&[]Ability{
		{Group: "g", Model: "m", ChannelId: 1, Enabled: true, Priority: &high, Weight: 1},
		{Group: "g", Model: "m", ChannelId: 2, Enabled: true, Priority: &low, Weight: 1},
	}).Error)

	channel, err := GetChannelExcluding("g", "m", 99, "", nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 2, channel.Id)
}

func TestGetChannelExcludingKeepsSinglePriorityOnRetry(t *testing.T) {
	db := useChannelRequestSelectionDB(t)
	priority := int64(10)
	require.NoError(t, db.Create(&Channel{Id: 1, Status: common.ChannelStatusEnabled}).Error)
	require.NoError(t, db.Create(&Ability{Group: "g", Model: "m", ChannelId: 1, Enabled: true, Priority: &priority, Weight: 1}).Error)

	channel, err := GetChannelExcluding("g", "m", 3, "", nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 1, channel.Id)
}

func TestCachedChannelExcludingClampsRetryToLowestPriority(t *testing.T) {
	db := useChannelRequestSelectionDB(t)
	high, low := int64(10), int64(1)
	channels := []Channel{
		{Id: 1, Status: common.ChannelStatusEnabled, Models: "m", Group: "g", Priority: &high},
		{Id: 2, Status: common.ChannelStatusEnabled, Models: "m", Group: "g", Priority: &low},
	}
	require.NoError(t, db.Create(&channels).Error)
	require.NoError(t, db.Create(&[]Ability{
		{Group: "g", Model: "m", ChannelId: 1, Enabled: true, Priority: &high, Weight: 1},
		{Group: "g", Model: "m", ChannelId: 2, Enabled: true, Priority: &low, Weight: 1},
	}).Error)
	common.MemoryCacheEnabled = true
	InitChannelCache()

	channel, err := GetRandomSatisfiedChannelExcluding("g", "m", 99, "", nil)
	require.NoError(t, err)
	require.NotNil(t, channel)
	require.Equal(t, 2, channel.Id)
}
