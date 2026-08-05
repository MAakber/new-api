package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type legacyPasskeyCredential struct {
	ID           int    `gorm:"primaryKey"`
	UserID       int    `gorm:"uniqueIndex;not null"`
	CredentialID string `gorm:"type:varchar(512);uniqueIndex;not null"`
	PublicKey    string `gorm:"type:text;not null"`
}

func (legacyPasskeyCredential) TableName() string { return "passkey_credentials" }

func TestMigratePasskeyCredentialIndexesPreservesLegacyDataAndAllowsMultipleDevices(t *testing.T) {
	previousDB := DB
	previousType := common.MainDatabaseType()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
		_ = sqlDB.Close()
	})

	require.NoError(t, db.AutoMigrate(&legacyPasskeyCredential{}))
	legacy := legacyPasskeyCredential{UserID: 7, CredentialID: "legacy-credential", PublicKey: "legacy-public-key"}
	require.NoError(t, db.Create(&legacy).Error)
	require.NoError(t, db.AutoMigrate(&PasskeyCredential{}))
	require.NoError(t, MigratePasskeyCredentialIndexes())

	var stored PasskeyCredential
	require.NoError(t, db.First(&stored, legacy.ID).Error)
	assert.Equal(t, "legacy-credential", stored.CredentialID)
	assert.Equal(t, fmt.Sprintf("Passkey %d", legacy.ID), stored.DisplayName)
	assert.True(t, db.Migrator().HasIndex(&PasskeyCredential{}, "idx_passkey_credentials_user_id"))

	second := PasskeyCredential{
		UserID: 7, CredentialID: "second-credential", DisplayName: "Laptop", PublicKey: "second-public-key",
	}
	require.NoError(t, db.Create(&second).Error)
	var count int64
	require.NoError(t, db.Model(&PasskeyCredential{}).Where("user_id = ?", 7).Count(&count).Error)
	assert.EqualValues(t, 2, count)
}
