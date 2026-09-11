package model

import (
	_ "embed"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// These are the explicit operator scripts, not an automatic startup migration.
//
//go:embed migrations/wallet64_mysql.sql
var walletMySQLMigration string

//go:embed migrations/wallet64_postgres.sql
var walletPostgresMigration string

func TestWalletSchemaMigrationContracts(t *testing.T) {
	db, dialect := openWalletFixture(t, "TEST_WALLET_DSN")
	require.False(t, db.Migrator().HasTable(&User{}), "wallet fixtures require an empty disposable database")
	recorder := &migrationSQLRecorder{}
	DB, LOG_DB = db.Session(&gorm.Session{Logger: recorder}), db
	require.NoError(t, migrateDB())
	require.NoError(t, migrateLOGDB())
	seedDatabaseUpgradeFixture(t)
	for _, user := range []User{
		{Username: "wallet-positive", AffCode: "wallet-positive", Password: "fixture", Quota: 2147483647, UsedQuota: 2147483647, AffQuota: 4321, AffHistoryQuota: 5432, RequestsPerMinute: common.GetPointer(33), AuthVersion: 7},
		{Username: "wallet-negative", AffCode: "wallet-negative", Password: "fixture", Quota: -2147483648, UsedQuota: 6789, AffQuota: 9876, AffHistoryQuota: 8765, RequestsPerMinute: common.GetPointer(34), AuthVersion: 8},
	} {
		require.NoError(t, db.Create(&user).Error)
	}
	var before []User
	require.NoError(t, db.Order("id").Find(&before).Error)
	var beforeTotal string
	require.NoError(t, db.Raw("SELECT SUM(quota) FROM users").Scan(&beforeTotal).Error)

	if dialect != common.DatabaseTypeSQLite {
		// A fixture-only downgrade produces exactly the released signed INT
		// wallet columns before any large balances have been introduced.
		legacySQL := "ALTER TABLE users MODIFY COLUMN quota INT NULL DEFAULT 0, MODIFY COLUMN used_quota INT NULL DEFAULT 0, MODIFY COLUMN aff_quota INT NULL DEFAULT 0, MODIFY COLUMN aff_history INT NULL DEFAULT 0"
		partialSQL := "ALTER TABLE users MODIFY COLUMN quota BIGINT NULL DEFAULT 0"
		if dialect == common.DatabaseTypePostgreSQL {
			legacySQL = "ALTER TABLE users ALTER COLUMN quota TYPE INTEGER, ALTER COLUMN used_quota TYPE INTEGER, ALTER COLUMN aff_quota TYPE INTEGER, ALTER COLUMN aff_history TYPE INTEGER"
			partialSQL = "ALTER TABLE users ALTER COLUMN quota TYPE BIGINT"
		}
		require.NoError(t, db.Exec(legacySQL).Error)
		recorder.reset()
		require.ErrorContains(t, migrateDB(), "users.quota")
		assert.Empty(t, recorder.schemaMutations(), "startup must reject legacy columns before DDL")
		for _, statement := range recorder.statements {
			normalized := strings.ToUpper(strings.TrimSpace(statement))
			assert.False(t, strings.HasPrefix(normalized, "INSERT ") || strings.HasPrefix(normalized, "UPDATE ") || strings.HasPrefix(normalized, "DELETE "), "rejected startup must not write: %s", statement)
		}
		// Test the actual application initializer, including its non-master path.
		t.Setenv("SQL_DSN", os.Getenv("TEST_WALLET_DSN"))
		t.Setenv("LOG_SQL_DSN", "")
		previousMaster := common.IsMasterNode
		t.Cleanup(func() { common.IsMasterNode = previousMaster })
		for _, master := range []bool{false, true} {
			common.IsMasterNode = master
			require.ErrorContains(t, InitDB(), "users.quota")
			connection, err := DB.DB()
			require.NoError(t, err)
			require.NoError(t, connection.Close())
			DB = db.Session(&gorm.Session{Logger: recorder})
		}
		require.NoError(t, db.Exec(partialSQL).Error)
		require.ErrorContains(t, migrateDB(), "users.used_quota", "a partial upgrade must remain blocked")
		script := walletMySQLMigration
		if dialect == common.DatabaseTypePostgreSQL {
			script = walletPostgresMigration
		}
		require.NoError(t, db.Exec(script).Error, "operator migration must recover a partial upgrade")
		require.NoError(t, ensureUserQuotaColumns(db, dialect))
		require.NoError(t, db.Exec(script).Error, "repeating the explicit migration must preserve data")
		require.NoError(t, db.Migrator().RenameColumn(&User{}, "aff_history", "fixture_missing_history"))
		require.ErrorContains(t, ensureUserQuotaColumns(db, dialect), "users.aff_history is missing")
		require.NoError(t, db.Migrator().RenameColumn(&User{}, "fixture_missing_history", "aff_history"))
		if dialect == common.DatabaseTypeMySQL {
			require.NoError(t, db.Exec("ALTER TABLE users MODIFY COLUMN used_quota BIGINT UNSIGNED NULL DEFAULT 0").Error)
			require.ErrorContains(t, ensureUserQuotaColumns(db, dialect), "users.used_quota", "unsigned BIGINT cannot represent the signed wallet contract")
			require.NoError(t, db.Exec(script).Error)
		}
	}
	var after []User
	require.NoError(t, db.Order("id").Find(&after).Error)
	assert.Equal(t, before, after, "every user field must survive migration")
	var afterTotal string
	require.NoError(t, db.Raw("SELECT SUM(quota) FROM users").Scan(&afterTotal).Error)
	assert.Equal(t, beforeTotal, afterTotal, "wallet totals must reconcile exactly")
	t.Run("downstream_records_and_constraints", verifyDatabaseUpgradeFixture)
	for _, name := range []string{"wallet-positive", "wallet-negative"} {
		var user User
		require.NoError(t, db.Where("username = ?", name).First(&user).Error)
		large := common.MaxWalletQuota - 1
		if name == "wallet-negative" {
			large = -large
		}
		require.NoError(t, db.Model(&user).Updates(map[string]any{"quota": large, "used_quota": common.MaxWalletQuota, "aff_quota": common.MaxWalletQuota - 2, "aff_history": common.MaxWalletQuota - 3}).Error)
		adjustment, err := AdjustUserQuota(user.Id, common.RoleRootUser, "override", -large)
		require.NoError(t, err)
		assert.Equal(t, large, adjustment.Before)
		assert.Equal(t, -large, adjustment.After)
		require.NoError(t, db.First(&user, user.Id).Error)
		assert.Equal(t, -large, user.Quota)
		assert.Equal(t, common.MaxWalletQuota, user.UsedQuota)
		assert.Equal(t, common.MaxWalletQuota-2, user.AffQuota)
		assert.Equal(t, common.MaxWalletQuota-3, user.AffHistoryQuota)
		if name == "wallet-negative" {
			assert.EqualValues(t, 8, user.AuthVersion)
		} else {
			assert.EqualValues(t, 7, user.AuthVersion)
		}
	}
	for restart := 1; restart <= 2; restart++ {
		recorder.reset()
		require.NoError(t, migrateDB())
		require.NoError(t, migrateLOGDB())
		assert.Empty(t, recorder.schemaMutations(), "restart %d must keep BIGINT without repeated DDL", restart)
	}
	t.Log("fresh schema, legacy startup rejection, partial/repeated migration, signed large balances, exact totals and downstream data verified")
}

func TestWalletMigrateReleasedSchema(t *testing.T) {
	if os.Getenv("TEST_WALLET_RELEASED_DSN") == "" {
		t.Skip("set TEST_WALLET_RELEASED_DSN to an isolated database seeded by the released binary")
	}
	db, dialect := openWalletFixture(t, "TEST_WALLET_RELEASED_DSN")
	require.True(t, db.Migrator().HasTable(&User{}))
	var before []User
	require.NoError(t, db.Order("id").Find(&before).Error)
	require.NotEmpty(t, before)
	if dialect != common.DatabaseTypeSQLite {
		columns, err := db.Migrator().ColumnTypes(&User{})
		require.NoError(t, err)
		for _, column := range columns {
			for _, name := range userQuotaColumns {
				if column.Name() == name {
					declaration, _ := column.ColumnType()
					t.Logf("released users.%s: %s (%s)", name, column.DatabaseTypeName(), declaration)
				}
			}
		}
		if err := ensureUserQuotaColumns(db, dialect); err != nil {
			require.ErrorContains(t, err, "users.")
			script := walletMySQLMigration
			if dialect == common.DatabaseTypePostgreSQL {
				script = walletPostgresMigration
			}
			require.NoError(t, db.Exec(script).Error)
		} else {
			t.Log("released schema already has signed BIGINT wallet columns; no ALTER is necessary")
		}
	}
	require.NoError(t, ensureUserQuotaColumns(db, dialect))
	var after []User
	require.NoError(t, db.Order("id").Find(&after).Error)
	assert.Equal(t, before, after, "released user records must remain exact")
}
