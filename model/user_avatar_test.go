package model

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestUserAvatarSaveGetAndDelete(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, db.AutoMigrate(&UserAvatar{}))

	avatar := &UserAvatar{
		UserID:    7,
		ObjectKey: "7/avatar.png",
		MimeType:  "image/png",
		Size:      123,
		Width:     64,
		Height:    64,
		SHA256:    "abc",
	}
	require.NoError(t, SaveUserAvatar(avatar))
	require.NotZero(t, avatar.ID)
	require.NotZero(t, avatar.Version)
	require.False(t, avatar.UpdatedAt.IsZero())

	got, err := GetUserAvatar(7)
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, avatar.ObjectKey, got.ObjectKey)
	assert.Equal(t, avatar.Version, got.Version)

	duplicate := &UserAvatar{UserID: 7, ObjectKey: "7/other.png"}
	require.NoError(t, SaveUserAvatar(duplicate))
	got, err = GetUserAvatar(7)
	require.NoError(t, err)
	assert.Equal(t, "7/other.png", got.ObjectKey)

	require.NoError(t, DeleteUserAvatar(7))
	got, err = GetUserAvatar(7)
	require.NoError(t, err)
	assert.Nil(t, got)
	require.NoError(t, DeleteUserAvatar(7))
}

func TestDeleteUserAvatarWithTxSkipsLegacyFixtureWithoutTable(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, DeleteUserAvatarWithTx(db, 7))
}
