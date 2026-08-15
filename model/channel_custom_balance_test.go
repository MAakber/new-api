package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelCustomBalanceModelDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}, &ChannelCustomBalance{}))
	DB = db
	t.Cleanup(func() {
		DB = previousDB
		_ = sqlDB.Close()
	})
	return db
}

func TestChannelDeletionCleansCustomBalanceConfig(t *testing.T) {
	db := setupChannelCustomBalanceModelDB(t)
	channels := []*Channel{
		{Name: "single-delete"},
		{Name: "batch-delete"},
		{Name: "retained"},
	}
	for _, channel := range channels {
		require.NoError(t, db.Create(channel).Error)
		require.NoError(t, db.Create(&ChannelCustomBalance{ChannelID: channel.Id, EncryptedCredential: "encrypted"}).Error)
	}

	require.NoError(t, channels[0].Delete())
	var config ChannelCustomBalance
	assert.ErrorIs(t, db.First(&config, "channel_id = ?", channels[0].Id).Error, gorm.ErrRecordNotFound)

	deletedCount, err := BatchDeleteChannels([]int{channels[1].Id, 999999})
	require.NoError(t, err)
	assert.Equal(t, int64(1), deletedCount)
	assert.ErrorIs(t, db.First(&config, "channel_id = ?", channels[1].Id).Error, gorm.ErrRecordNotFound)
	require.NoError(t, db.First(&config, "channel_id = ?", channels[2].Id).Error)
}
