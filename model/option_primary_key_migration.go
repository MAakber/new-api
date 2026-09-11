package model

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const optionLegacyTablePrefix = "options_legacy_"

// Repair in place so a writer waiting on the original table cannot resume on
// a renamed backup. Historical options have no ordering column that proves
// which of two conflicting administrator values is newer.
func migrateOptionPrimaryKey(db *gorm.DB) error {
	if db == nil {
		return fmt.Errorf("migrate options primary key: database is nil")
	}
	if !db.Migrator().HasTable(&Option{}) {
		return nil
	}
	unique, err := optionsKeyIsUnique(db)
	if err != nil || unique {
		return err
	}
	ctx, cancel := context.WithTimeout(db.Statement.Context, time.Minute)
	defer cancel()
	db = db.WithContext(ctx)
	if db.Dialector.Name() == "mysql" {
		return db.Connection(func(conn *gorm.DB) (migrationErr error) {
			// LOCK TABLES belongs to one physical connection. A GORM implicit
			// transaction would release those locks before its write.
			conn = conn.Session(&gorm.Session{SkipDefaultTransaction: true})
			var acquired int
			if err := conn.Raw("SELECT GET_LOCK(CONCAT('new_api_options_pk_', MD5(DATABASE())), 60)").Row().Scan(&acquired); err != nil {
				return fmt.Errorf("lock options migration: %w", err)
			}
			if acquired != 1 {
				return fmt.Errorf("lock options migration: timeout")
			}
			defer func() {
				cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cleanupCancel()
				cleanup := conn.WithContext(cleanupCtx)
				migrationErr = errors.Join(migrationErr, cleanup.Exec("UNLOCK TABLES").Error,
					cleanup.Exec("SELECT RELEASE_LOCK(CONCAT('new_api_options_pk_', MD5(DATABASE())))").Error)
			}()
			unique, err := optionsKeyIsUnique(conn)
			if err != nil || unique {
				return err
			}
			backup := fmt.Sprintf("%s%d", optionLegacyTablePrefix, time.Now().UnixNano())
			if err := conn.Exec("CREATE TABLE ? LIKE ?", clause.Table{Name: backup}, clause.Table{Name: "options"}).Error; err != nil {
				return fmt.Errorf("create options backup: %w", err)
			}
			if err := conn.Exec("LOCK TABLES ? WRITE, ? WRITE", clause.Table{Name: "options"}, clause.Table{Name: backup}).Error; err != nil {
				return fmt.Errorf("lock options writers: %w", err)
			}
			return repairOptionPrimaryKey(conn, backup)
		})
	}
	return db.Transaction(func(tx *gorm.DB) error {
		if tx.Dialector.Name() == "postgres" {
			if err := tx.Exec("LOCK TABLE ? IN ACCESS EXCLUSIVE MODE", clause.Table{Name: "options"}).Error; err != nil {
				return fmt.Errorf("lock options writers: %w", err)
			}
		} else {
			// SQLite takes its database write lock before we read the snapshot.
			if err := tx.Exec("UPDATE ? SET ? = ? WHERE 1 = 0", clause.Table{Name: "options"}, clause.Column{Name: "key"}, clause.Column{Name: "key"}).Error; err != nil {
				return fmt.Errorf("lock options writers: %w", err)
			}
		}
		unique, err := optionsKeyIsUnique(tx)
		if err != nil || unique {
			return err
		}
		return repairOptionPrimaryKey(tx, fmt.Sprintf("%s%d", optionLegacyTablePrefix, time.Now().UnixNano()))
	})
}

func optionsKeyIsUnique(db *gorm.DB) (bool, error) {
	var count int64
	var err error
	switch db.Dialector.Name() {
	case "mysql":
		err = db.Raw(`SELECT COUNT(*) FROM (
SELECT index_name FROM information_schema.statistics
WHERE table_schema = DATABASE() AND table_name = 'options'
GROUP BY index_name HAVING COUNT(*) = 1 AND MIN(column_name) = 'key'
AND MIN(non_unique) = 0 AND COUNT(sub_part) = 0
) AS option_unique_indexes`).Scan(&count).Error
	case "postgres":
		err = db.Raw(`SELECT COUNT(*) FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_attribute AS a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
WHERE i.indrelid = to_regclass('options') AND a.attname = 'key'
AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnatts = 1`).Scan(&count).Error
	case "sqlite":
		err = db.Raw(`SELECT COUNT(*) FROM pragma_index_list('options') AS i
WHERE i."unique" = 1 AND i.partial = 0
AND (SELECT COUNT(*) FROM pragma_index_info(i.name)) = 1
AND (SELECT name FROM pragma_index_info(i.name)) = 'key'`).Scan(&count).Error
	default:
		return false, fmt.Errorf("unsupported options database %q", db.Dialector.Name())
	}
	if err != nil {
		return false, fmt.Errorf("inspect options uniqueness: %w", err)
	}
	return count > 0, nil
}

func repairOptionPrimaryKey(db *gorm.DB, backup string) error {
	var invalid int64
	if err := db.Model(&Option{}).Where(clause.Or(
		clause.Eq{Column: "key", Value: nil}, clause.Eq{Column: "key", Value: ""},
		clause.Eq{Column: "value", Value: nil},
	)).Count(&invalid).Error; err != nil {
		return err
	}
	if invalid != 0 {
		return fmt.Errorf("options has %d rows with empty/null keys or null values; resolve them before startup", invalid)
	}
	var rows []Option
	if err := db.Find(&rows).Error; err != nil {
		return fmt.Errorf("read options rows: %w", err)
	}
	deduped, err := dedupeOptionRows(rows)
	if err != nil {
		return err
	}
	counts := make(map[string]int, len(deduped))
	for _, row := range rows {
		counts[row.Key]++
	}
	var mysqlColumn struct {
		Charset   string `gorm:"column:character_set_name"`
		Collation string `gorm:"column:collation_name"`
	}
	if db.Dialector.Name() == "mysql" {
		for _, row := range deduped {
			if utf8.RuneCountInString(row.Key) > 191 {
				return fmt.Errorf("options has a key longer than 191 characters; resolve it before startup")
			}
		}
		if err := db.Raw(`SELECT character_set_name, collation_name FROM information_schema.columns
WHERE table_schema = DATABASE() AND table_name = 'options' AND column_name = 'key'`).Scan(&mysqlColumn).Error; err != nil {
			return err
		}
		if !optionSafeIdent(mysqlColumn.Charset) || !optionSafeIdent(mysqlColumn.Collation) {
			return fmt.Errorf("options.key must have a supported text character set and collation")
		}
		if err := db.Exec("INSERT INTO ? SELECT * FROM ?", clause.Table{Name: backup}, clause.Table{Name: "options"}).Error; err != nil {
			return fmt.Errorf("copy options backup: %w", err)
		}
	} else if err := db.Exec("CREATE TABLE ? AS SELECT * FROM ?", clause.Table{Name: backup}, clause.Table{Name: "options"}).Error; err != nil {
		return fmt.Errorf("copy options backup: %w", err)
	}
	var backedUp int64
	if err := db.Table(backup).Count(&backedUp).Error; err != nil {
		return err
	}
	if backedUp != int64(len(rows)) {
		return fmt.Errorf("options backup has %d rows, want %d", backedUp, len(rows))
	}
	for _, row := range deduped {
		duplicates := counts[row.Key] - 1
		if duplicates == 0 {
			continue
		}
		var result *gorm.DB
		switch db.Dialector.Name() {
		case "mysql":
			result = db.Exec("DELETE FROM `options` WHERE BINARY `key` = BINARY ? LIMIT ?", row.Key, duplicates)
		case "postgres":
			result = db.Exec(`DELETE FROM options WHERE ctid IN (SELECT ctid FROM options WHERE "key" COLLATE "C" = ? LIMIT ?)`, row.Key, duplicates)
		default:
			result = db.Exec(`DELETE FROM options WHERE rowid IN (SELECT rowid FROM options WHERE "key" COLLATE BINARY = ? LIMIT ?)`, row.Key, duplicates)
		}
		if result.Error != nil {
			return fmt.Errorf("deduplicate options, backup %s: %w", backup, result.Error)
		}
		if result.RowsAffected != int64(duplicates) {
			return fmt.Errorf("options deduplication affected %d rows, want %d; backup %s", result.RowsAffected, duplicates, backup)
		}
	}
	if db.Dialector.Name() == "mysql" {
		err = db.Exec("ALTER TABLE ? MODIFY COLUMN ? varchar(191) CHARACTER SET ? COLLATE ? NOT NULL, ADD UNIQUE INDEX ? (?)",
			clause.Table{Name: "options"}, clause.Column{Name: "key"}, clause.Column{Name: mysqlColumn.Charset},
			clause.Column{Name: mysqlColumn.Collation}, clause.Column{Name: "idx_options_key_repaired"}, clause.Column{Name: "key"}).Error
	} else {
		err = db.Exec("CREATE UNIQUE INDEX ? ON ? (?)", clause.Column{Name: "idx_options_key_repaired"}, clause.Table{Name: "options"}, clause.Column{Name: "key"}).Error
	}
	if err != nil {
		return fmt.Errorf("repair options uniqueness, backup %s: %w", backup, err)
	}
	unique, err := optionsKeyIsUnique(db)
	if err != nil {
		return err
	}
	if !unique {
		return fmt.Errorf("options still has no unique key after repair; backup %s", backup)
	}
	common.SysLog(fmt.Sprintf("repaired options uniqueness from %d rows into %d keys; original rows kept in %s", len(rows), len(deduped), backup))
	return nil
}

func dedupeOptionRows(rows []Option) ([]Option, error) {
	values := make(map[string]string, len(rows))
	deduped := make([]Option, 0, len(rows))
	for _, row := range rows {
		if value, exists := values[row.Key]; exists {
			if value != row.Value {
				return nil, fmt.Errorf("options key %q has conflicting values; resolve them before startup", row.Key)
			}
			continue
		}
		values[row.Key] = row.Value
		deduped = append(deduped, row)
	}
	return deduped, nil
}

func optionSafeIdent(name string) bool {
	return name != "" && !strings.ContainsFunc(name, func(r rune) bool {
		return r != '_' && (r < '0' || r > '9') && (r < 'a' || r > 'z')
	})
}
