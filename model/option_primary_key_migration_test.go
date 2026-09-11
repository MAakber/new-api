package model

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func TestOptionPrimaryKeyMigration(t *testing.T) {
	previousDB, previousPath := DB, common.SQLitePath
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	t.Cleanup(func() {
		DB, common.SQLitePath = previousDB, previousPath
		common.SetDatabaseTypes(previousMain, previousLog)
		initCol()
	})
	db, kind := openUpgradeFixtureDB(t, "TEST_OPTIONS_MIGRATION_DSN", filepath.Join(t.TempDir(), "options.db"))
	require.False(t, db.Migrator().HasTable(&Option{}), "requires a new disposable fixture database")
	DB = db
	common.SetDatabaseTypes(kind, previousLog)
	initCol()
	createLegacy := func(t *testing.T, rows []Option) {
		t.Helper()
		require.NoError(t, db.Exec("CREATE TABLE ? (? text, ? text)", clause.Table{Name: "options"}, clause.Column{Name: "key"}, clause.Column{Name: "value"}).Error)
		t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(&Option{})) })
		if len(rows) > 0 {
			require.NoError(t, db.Create(&rows).Error)
		}
	}

	t.Run("identical_duplicates_restart_and_pricing_seed", func(t *testing.T) {
		original := []Option{
			{Key: "ModelPrice", Value: `{"custom-zero":0,"custom-paid":4.125}`},
			{Key: "ModelPrice", Value: `{"custom-zero":0,"custom-paid":4.125}`},
			{Key: "RegistrationCodeEnabled", Value: "true"},
			{Key: "empty-value", Value: ""},
		}
		createLegacy(t, original)
		require.ErrorIs(t, SeedCanonicalPricingOptions(), ErrPricingOptionIntegrity)
		require.NoError(t, migrateOptionPrimaryKey(db))
		var actual []Option
		require.NoError(t, db.Find(&actual).Error)
		assert.ElementsMatch(t, original[1:], actual)
		assert.Error(t, db.Create(&original[0]).Error, "a duplicate key must now be rejected")
		tables, err := db.Migrator().GetTables()
		require.NoError(t, err)
		var backups []string
		for _, table := range tables {
			if strings.HasPrefix(table, optionLegacyTablePrefix) {
				backups = append(backups, table)
			}
		}
		require.Len(t, backups, 1)
		var backup []Option
		require.NoError(t, db.Table(backups[0]).Find(&backup).Error)
		assert.ElementsMatch(t, original, backup)
		require.NoError(t, db.AutoMigrate(&Option{}))
		require.NoError(t, SeedCanonicalPricingOptions())
		recorder := &migrationSQLRecorder{}
		restarted := db.Session(&gorm.Session{Logger: recorder})
		require.NoError(t, migrateOptionPrimaryKey(restarted))
		require.NoError(t, restarted.AutoMigrate(&Option{}))
		assert.Empty(t, recorder.schemaMutations(), "unchanged restart must not rebuild options")
		require.NoError(t, SeedCanonicalPricingOptions())
		var price Option
		require.NoError(t, db.Where(&Option{Key: "ModelPrice"}).First(&price).Error)
		assert.Equal(t, original[0].Value, price.Value)
	})

	t.Run("ambiguous_prices_stop_startup_without_writes", func(t *testing.T) {
		original := []Option{{Key: "ModelPrice", Value: `{"custom":0}`}, {Key: "ModelPrice", Value: `{"custom":8}`}}
		createLegacy(t, original)
		err := migrateDB()
		require.ErrorContains(t, err, "conflicting values")
		assert.NotContains(t, err.Error(), original[0].Value)
		assert.False(t, db.Migrator().HasTable(&User{}), "startup stops before unrelated migrations")
		require.ErrorIs(t, SeedCanonicalPricingOptions(), ErrPricingOptionIntegrity)
		_, err = readModelPricingMaps(db)
		require.ErrorIs(t, err, ErrPricingOptionIntegrity)
		_, err = MutatePricingOptions(func(_ *gorm.DB, _ map[string]map[string]json.RawMessage) error {
			t.Error("ambiguous persisted pricing must not reach a mutation")
			return nil
		})
		require.ErrorIs(t, err, ErrPricingOptionIntegrity)
		_, err = RefreshPricingOptionMapsFromDatabase()
		require.ErrorIs(t, err, ErrPricingOptionIntegrity)
		var actual []Option
		require.NoError(t, db.Find(&actual).Error)
		assert.ElementsMatch(t, original, actual)
	})

	for _, row := range []map[string]any{{"key": "", "value": "saved"}, {"key": nil, "value": "saved"}, {"key": "custom", "value": nil}} {
		t.Run("invalid_legacy_row", func(t *testing.T) {
			createLegacy(t, nil)
			require.NoError(t, db.Table("options").Create(map[string]any{"key": row["key"], "value": row["value"]}).Error)
			require.ErrorContains(t, migrateOptionPrimaryKey(db), "empty/null keys or null values")
			var actual []map[string]any
			require.NoError(t, db.Table("options").Find(&actual).Error)
			require.Len(t, actual, 1)
			for key, value := range row {
				if value == nil {
					assert.Nil(t, actual[0][key])
				} else if bytes, ok := actual[0][key].([]byte); ok {
					assert.Equal(t, value, string(bytes))
				} else {
					assert.Equal(t, value, actual[0][key])
				}
			}
		})
	}

	t.Run("interrupted_repair_keeps_values_and_accepts_restart", func(t *testing.T) {
		original := []Option{{Key: "ModelPrice", Value: `{"custom":3}`}, {Key: "ModelPrice", Value: `{"custom":3}`}}
		createLegacy(t, original)
		require.NoError(t, db.Callback().Raw().Before("gorm:raw").Register("fail_option_constraint", func(tx *gorm.DB) {
			statement := tx.Statement.SQL.String()
			if strings.Contains(statement, "idx_options_key_repaired") {
				_ = tx.AddError(errors.New("fixture constraint failure"))
			}
		}))
		err := migrateOptionPrimaryKey(db)
		require.NoError(t, db.Callback().Raw().Remove("fail_option_constraint"))
		require.ErrorContains(t, err, "fixture constraint failure")
		var actual []Option
		require.NoError(t, db.Find(&actual).Error)
		if kind == common.DatabaseTypeMySQL {
			assert.Equal(t, original[:1], actual, "only identical duplicate rows may have been removed")
		} else {
			assert.ElementsMatch(t, original, actual, "transactional engines roll back the repair")
		}
		latest := `{"custom":7}`
		require.NoError(t, db.Model(&Option{}).Where(&Option{Key: "ModelPrice"}).UpdateColumn("value", latest).Error)
		require.NoError(t, migrateOptionPrimaryKey(db))
		actual = nil
		require.NoError(t, db.Find(&actual).Error)
		assert.Equal(t, []Option{{Key: "ModelPrice", Value: latest}}, actual)
	})

	t.Run("ordinary_writers_wait_for_snapshot", func(t *testing.T) {
		createLegacy(t, []Option{{Key: "SystemName", Value: "before"}})
		writer, _, err := chooseDB("TEST_OPTIONS_MIGRATION_DSN", false)
		require.NoError(t, err)
		writerSQL, err := writer.DB()
		require.NoError(t, err)
		t.Cleanup(func() { require.NoError(t, writerSQL.Close()) })
		if kind == common.DatabaseTypeSQLite {
			writerSQL.SetMaxOpenConns(1)
			require.NoError(t, writer.Exec("PRAGMA busy_timeout = 0").Error)
		}
		snapshot, release := make(chan struct{}), make(chan struct{})
		var released sync.Once
		defer released.Do(func() { close(release) })
		type migrationContextKey struct{}
		var observed sync.Once
		require.NoError(t, db.Callback().Query().After("gorm:query").Register("pause_option_snapshot", func(tx *gorm.DB) {
			if tx.Statement.Table == "options" && tx.Statement.Context.Value(migrationContextKey{}) == true {
				if _, ok := tx.Statement.Dest.(*[]Option); ok {
					observed.Do(func() { close(snapshot); <-release })
				}
			}
		}))
		defer func() { require.NoError(t, db.Callback().Query().Remove("pause_option_snapshot")) }()
		finished := make(chan error, 1)
		go func() {
			finished <- migrateOptionPrimaryKey(db.WithContext(context.WithValue(context.Background(), migrationContextKey{}, true)))
		}()
		select {
		case <-snapshot:
		case err := <-finished:
			t.Fatalf("migration ended before its snapshot: %v", err)
		case <-time.After(10 * time.Second):
			t.Fatal("migration never reached its snapshot")
		}
		// The statement deadline only bounds a real lock wait; it is not a
		// timing assertion. The same write must succeed after the lock ends.
		ctx, cancel := context.WithTimeout(context.Background(), 250*time.Millisecond)
		err = writer.WithContext(ctx).Model(&Option{}).Where(&Option{Key: "SystemName"}).UpdateColumn("value", "during").Error
		cancel()
		assert.Error(t, err, "an ordinary writer cannot commit during the migration snapshot")
		released.Do(func() { close(release) })
		require.NoError(t, <-finished)
		require.NoError(t, writer.Model(&Option{}).Where(&Option{Key: "SystemName"}).UpdateColumn("value", "after").Error)
		var actual Option
		require.NoError(t, db.Where(&Option{Key: "SystemName"}).First(&actual).Error)
		assert.Equal(t, "after", actual.Value)
	})

	if kind != common.DatabaseTypeMySQL {
		t.Run("partial_unique_index_does_not_protect_pricing", func(t *testing.T) {
			createLegacy(t, []Option{{Key: "ModelPrice", Value: "{}"}, {Key: "ModelPrice", Value: "{}"}})
			require.NoError(t, db.Exec(`CREATE UNIQUE INDEX legacy_partial_options ON options ("key") WHERE "key" <> 'ModelPrice'`).Error)
			require.NoError(t, migrateOptionPrimaryKey(db))
			assert.Error(t, db.Create(&Option{Key: "ModelPrice", Value: "{}"}).Error)
			require.NoError(t, SeedCanonicalPricingOptions())
		})
	}
}
