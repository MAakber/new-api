package model

import (
	"fmt"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm/schema"
)

// passkeyCredentialLegacyUserIDIndexSchema describes the old anonymous
// uniqueIndex tag exactly as GORM derived it. Parsing this schema is deliberate:
// it avoids guessing an index name and keeps migration aligned with the GORM
// version/naming strategy that created the legacy schema.
type passkeyCredentialLegacyUserIDIndexSchema struct {
	UserID int `gorm:"column:user_id;uniqueIndex"`
}

func (passkeyCredentialLegacyUserIDIndexSchema) TableName() string {
	return "passkey_credentials"
}

// MigratePasskeyCredentialIndexes converts the pre-multi-device unique user_id
// index to the current ordinary index. It runs after AutoMigrate because the
// DisplayName column and target schema must already exist. GetIndexes supplies
// actual database index metadata; the legacy GORM schema is parsed to preserve
// the tag-derived historical definition without relying on a hard-coded name.
func MigratePasskeyCredentialIndexes() error {
	if DB == nil {
		return fmt.Errorf("passkey credential migration: database is unavailable")
	}
	migrator := DB.Migrator()
	if !migrator.HasTable(&PasskeyCredential{}) {
		return nil
	}
	// Existing single-device rows predate user-facing names. The primary key is
	// stable and makes the generated legacy label unique without exposing any
	// credential material.
	var unnamed []PasskeyCredential
	if err := DB.Select("id", "user_id", "display_name").Where("display_name = ? OR display_name IS NULL", "").Find(&unnamed).Error; err != nil {
		return fmt.Errorf("passkey credential migration: list unnamed credentials: %w", err)
	}
	for i := range unnamed {
		name := fmt.Sprintf("Passkey %d", unnamed[i].ID)
		if err := DB.Model(&PasskeyCredential{}).Where("id = ?", unnamed[i].ID).Update("display_name", name).Error; err != nil {
			return fmt.Errorf("passkey credential migration: backfill credential %d name: %w", unnamed[i].ID, err)
		}
	}
	indexes, err := passkeyCredentialIndexes()
	if err != nil {
		return fmt.Errorf("passkey credential migration: list indexes: %w", err)
	}
	legacyNames, err := legacyPasskeyUserIDUniqueIndexNames()
	if err != nil {
		return err
	}
	legacyIndexNames := make([]string, 0)
	for _, index := range indexes {
		if !index.Unique || !isSingleUserIDIndex(index.Columns) {
			continue
		}
		// A unique single-column user_id index is invalid in the target model.
		// It may have been named by a historical custom GORM naming strategy,
		// so the inspected database metadata is authoritative.
		legacyIndexNames = append(legacyIndexNames, index.Name)
		delete(legacyNames, index.Name)
	}
	// Some drivers do not expose complete index metadata. Names parsed from the
	// exact legacy GORM schema are a safe fallback and follow the configured
	// naming strategy rather than guessing a database-specific identifier.
	for name := range legacyNames {
		if migrator.HasIndex(&PasskeyCredential{}, name) {
			legacyIndexNames = append(legacyIndexNames, name)
		}
	}
	for _, name := range legacyIndexNames {
		if err := migrator.DropIndex(&PasskeyCredential{}, name); err != nil {
			return fmt.Errorf("passkey credential migration: drop legacy unique user_id index %q: %w", name, err)
		}
	}
	indexes, err = passkeyCredentialIndexes()
	if err != nil {
		return fmt.Errorf("passkey credential migration: list indexes after cleanup: %w", err)
	}
	for _, index := range indexes {
		if !index.Unique && isSingleUserIDIndex(index.Columns) {
			return nil
		}
	}
	if err := migrator.CreateIndex(&PasskeyCredential{}, "idx_passkey_credentials_user_id"); err != nil {
		return fmt.Errorf("passkey credential migration: create user_id index: %w", err)
	}
	return nil
}

type passkeyIndexMetadata struct {
	Name    string
	Columns []string
	Unique  bool
}

func passkeyCredentialIndexes() ([]passkeyIndexMetadata, error) {
	indexes, err := DB.Migrator().GetIndexes(&PasskeyCredential{})
	if err == nil {
		result := make([]passkeyIndexMetadata, 0, len(indexes))
		for _, index := range indexes {
			unique, known := index.Unique()
			if !known {
				continue
			}
			result = append(result, passkeyIndexMetadata{Name: index.Name(), Columns: index.Columns(), Unique: unique})
		}
		return result, nil
	}
	if !common.UsingMainDatabase(common.DatabaseTypeSQLite) {
		return nil, err
	}
	return sqlitePasskeyCredentialIndexes()
}

func sqlitePasskeyCredentialIndexes() ([]passkeyIndexMetadata, error) {
	var rows []struct {
		Name   string `gorm:"column:name"`
		Unique int    `gorm:"column:unique"`
	}
	if err := DB.Raw(`PRAGMA index_list("passkey_credentials")`).Scan(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]passkeyIndexMetadata, 0, len(rows))
	for _, row := range rows {
		var columns []struct {
			Name string `gorm:"column:name"`
		}
		indexName := strings.ReplaceAll(row.Name, `"`, `""`)
		if err := DB.Raw(fmt.Sprintf(`PRAGMA index_info("%s")`, indexName)).Scan(&columns).Error; err != nil {
			return nil, err
		}
		columnNames := make([]string, 0, len(columns))
		for _, column := range columns {
			columnNames = append(columnNames, column.Name)
		}
		result = append(result, passkeyIndexMetadata{Name: row.Name, Columns: columnNames, Unique: row.Unique == 1})
	}
	return result, nil
}

func legacyPasskeyUserIDUniqueIndexNames() (map[string]struct{}, error) {
	legacySchema, err := schema.Parse(&passkeyCredentialLegacyUserIDIndexSchema{}, &sync.Map{}, DB.NamingStrategy)
	if err != nil {
		return nil, fmt.Errorf("passkey credential migration: parse legacy schema: %w", err)
	}
	names := make(map[string]struct{})
	for name, index := range legacySchema.ParseIndexes() {
		if index.Class != "UNIQUE" || len(index.Fields) != 1 || index.Fields[0].DBName != "user_id" {
			continue
		}
		names[name] = struct{}{}
	}
	return names, nil
}

func isSingleUserIDIndex(columns []string) bool {
	return len(columns) == 1 && columns[0] == "user_id"
}
