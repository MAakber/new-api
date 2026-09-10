package model

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPasswordEncryptionPersistence(t *testing.T) {
	for _, dialect := range []string{"sqlite", "mysql", "postgres"} {
		t.Run(dialect, func(t *testing.T) {
			var dsn string
			switch dialect {
			case "sqlite":
				dsn = "local"
				previousPath := common.SQLitePath
				common.SQLitePath = filepath.Join(t.TempDir(), "password-keys.db")
				t.Cleanup(func() { common.SQLitePath = previousPath })
			case "mysql":
				dsn = os.Getenv("TEST_MYSQL_DSN")
			case "postgres":
				dsn = os.Getenv("TEST_POSTGRES_DSN")
			}
			if dsn == "" {
				t.Skip("test database DSN is not configured")
			}
			t.Setenv("PASSWORD_ENCRYPTION_TEST_DSN", dsn)
			db, _, err := chooseDB("PASSWORD_ENCRYPTION_TEST_DSN", false)
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			require.False(t, db.Migrator().HasTable(&LoginEncryptionKey{}), "use an isolated fixture database")
			require.NoError(t, db.AutoMigrate(&LoginEncryptionKey{}))
			t.Cleanup(func() { _ = db.Migrator().DropTable(&LoginEncryptionKey{}) })
			previousDB := DB
			DB = db
			t.Cleanup(func() { DB = previousDB })
			require.NoError(t, InitPasswordEncryption())
			keyID, publicPEM := common.PasswordEncryptionPublicKey()
			require.NotEmpty(t, keyID)
			require.NotEmpty(t, publicPEM)

			// A new process must recover the persisted key, even when its current
			// in-memory key differs from the shared database.
			otherKey, err := common.GeneratePasswordEncryptionPrivateKey()
			require.NoError(t, err)
			require.NoError(t, common.LoadPasswordEncryptionPrivateKey(otherKey))
			reopened, _, err := chooseDB("PASSWORD_ENCRYPTION_TEST_DSN", false)
			require.NoError(t, err)
			reopenedSQL, err := reopened.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = reopenedSQL.Close() })
			DB = reopened
			require.NoError(t, InitPasswordEncryption())
			actualID, actualPEM := common.PasswordEncryptionPublicKey()
			assert.Equal(t, keyID, actualID)
			assert.Equal(t, publicPEM, actualPEM)
			var count int64
			require.NoError(t, DB.Model(&LoginEncryptionKey{}).Count(&count).Error)
			assert.EqualValues(t, 1, count)
			recorder := &migrationSQLRecorder{}
			require.NoError(t, DB.Session(&gorm.Session{Logger: recorder}).AutoMigrate(&LoginEncryptionKey{}))
			assert.Empty(t, recorder.schemaMutations(), "restarting must not issue DDL")

			require.NoError(t, DB.Model(&LoginEncryptionKey{}).Where("slot = ?", activeLoginEncryptionKeySlot).Update("private_key_pem", "corrupt key").Error)
			assert.Error(t, InitPasswordEncryption(), "invalid stored keys must fail initialization")
			actualID, _ = common.PasswordEncryptionPublicKey()
			assert.Equal(t, keyID, actualID)
		})
	}
}
