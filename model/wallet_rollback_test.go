package model

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func openWalletFixture(t *testing.T, environment string) (*gorm.DB, common.DatabaseType) {
	t.Helper()
	previousDB, previousLogDB := DB, LOG_DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousPath := common.SQLitePath
	previousRedis, previousBatch := common.RedisEnabled, common.BatchUpdateEnabled
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMain, previousLog)
		common.SQLitePath = previousPath
		common.RedisEnabled, common.BatchUpdateEnabled = previousRedis, previousBatch
		initCol()
	})
	t.Setenv("SKIP_64BIT_QUOTA_SCHEMA_CHECK", "false")
	sqlitePath := os.Getenv("TEST_WALLET_SQLITE_PATH")
	if sqlitePath == "" {
		sqlitePath = filepath.Join(t.TempDir(), "wallet.db")
	} else {
		require.True(t, filepath.IsAbs(sqlitePath))
		require.True(t, strings.HasPrefix(filepath.Base(filepath.Dir(sqlitePath)), "codex_sync_"), "wallet files require an isolated fixture directory")
	}
	db, dialect := openUpgradeFixtureDB(t, environment, sqlitePath)
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(dialect, dialect)
	common.RedisEnabled, common.BatchUpdateEnabled = false, false
	initCol()
	return db, dialect
}

// Copy this unchanged test to the recorded wallet-compatible rollback source.
// The candidate seeds post-migration transactions, that binary performs an
// additional credit, then the candidate checks both sets of transactions.
func TestWalletCompatibleRollback(t *testing.T) {
	phase := os.Getenv("TEST_WALLET_ROLLBACK_PHASE")
	if phase == "" {
		t.Skip("set TEST_WALLET_ROLLBACK_PHASE and TEST_WALLET_ROLLBACK_DSN for a compatible-binary rehearsal")
	}
	require.Contains(t, []string{"seed", "rollback", "verify"}, phase)
	require.NotEmpty(t, os.Getenv("TEST_WALLET_ROLLBACK_DSN"))
	db, dialect := openWalletFixture(t, "TEST_WALLET_ROLLBACK_DSN")
	require.NoError(t, ensureUserQuotaColumns(db, dialect))
	if phase == "seed" {
		for _, user := range []User{
			{Username: "wallet-post-large", AffCode: "wallet-post-large", Password: "fixture", Quota: common.MaxWalletQuota - 111, UsedQuota: common.MaxWalletQuota - 7, AffQuota: common.MaxWalletQuota - 9, AffHistoryQuota: common.MaxWalletQuota - 11, RequestsPerMinute: common.GetPointer(33), AuthVersion: 7},
			{Username: "wallet-post-negative", AffCode: "wallet-post-negative", Password: "fixture", Quota: -common.MaxWalletQuota + 111, RequestsPerMinute: common.GetPointer(34), AuthVersion: 8},
		} {
			require.NoError(t, db.Create(&user).Error)
			require.NoError(t, db.Create(&Log{UserId: user.Id, Type: LogTypeTopup, Quota: 37, RequestId: "wallet-post-migration-" + user.Username, Content: "post-migration fixture transaction"}).Error)
		}
		return
	}
	recorder := &migrationSQLRecorder{}
	DB, LOG_DB = db.Session(&gorm.Session{Logger: recorder}), db
	for restart := 1; restart <= 2; restart++ {
		recorder.reset()
		require.NoError(t, migrateDB())
		assert.Empty(t, recorder.schemaMutations(), "rollback and candidate must keep the upgraded schema")
	}
	for _, name := range []string{"wallet-post-large", "wallet-post-negative"} {
		var user User
		require.NoError(t, db.Where("username = ?", name).First(&user).Error)
		expected := common.MaxWalletQuota - 111
		if name == "wallet-post-negative" {
			expected = -expected
		} else {
			assert.Equal(t, common.MaxWalletQuota-7, user.UsedQuota)
			assert.Equal(t, common.MaxWalletQuota-9, user.AffQuota)
			assert.Equal(t, common.MaxWalletQuota-11, user.AffHistoryQuota)
			require.NotNil(t, user.RequestsPerMinute)
			assert.Equal(t, 33, *user.RequestsPerMinute)
			assert.EqualValues(t, 7, user.AuthVersion)
		}
		if phase == "verify" {
			expected += 11
		}
		assert.Equal(t, expected, user.Quota)
		var original Log
		require.NoError(t, db.Where("request_id = ?", "wallet-post-migration-"+name).First(&original).Error)
		assert.Equal(t, 37, original.Quota)
		if phase == "rollback" {
			require.NoError(t, IncreaseUserQuota(user.Id, 11, true))
			require.NoError(t, db.Create(&Log{UserId: user.Id, Type: LogTypeTopup, Quota: 11, RequestId: "wallet-compatible-rollback-" + name, Content: "compatible rollback credit"}).Error)
		} else {
			var credit Log
			require.NoError(t, db.Where("request_id = ?", "wallet-compatible-rollback-"+name).First(&credit).Error)
			assert.Equal(t, 11, credit.Quota)
		}
	}
}
