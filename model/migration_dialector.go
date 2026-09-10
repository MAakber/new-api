package model

import (
	"strings"

	"github.com/shopspring/decimal"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

// Embed the concrete dialectors to retain their transaction/savepoint and other
// optional GORM interfaces. Only schema comparison needs normalization.
type mysqlMigrationDialector struct{ mysql.Dialector }

func (d mysqlMigrationDialector) Migrator(db *gorm.DB) gorm.Migrator {
	return mysqlSchemaMigrator{d.Dialector.Migrator(db).(mysql.Migrator)}
}

type mysqlSchemaMigrator struct{ mysql.Migrator }

func (m mysqlSchemaMigrator) MigrateColumn(value any, field *schema.Field, column gorm.ColumnType) error {
	if strings.Contains(m.ServerVersion, "MariaDB") && strings.EqualFold(string(field.DataType), "json") && strings.EqualFold(column.DatabaseTypeName(), "longtext") {
		// MariaDB implements JSON as LONGTEXT plus a JSON_VALID check. Only
		// normalize columns that still enforce that check; plain LONGTEXT must
		// undergo the real conversion so invalid JSON cannot silently persist.
		var validJSON bool
		err := m.RunWithValue(value, func(statement *gorm.Statement) error {
			database, table := m.CurrentSchema(statement, statement.Table)
			var checks []string
			if err := m.DB.Raw("SELECT CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = ?", database, table).Scan(&checks).Error; err != nil {
				return err
			}
			for _, check := range checks {
				if strings.EqualFold(strings.TrimSpace(check), "json_valid(`"+field.DBName+"`)") {
					validJSON = true
					break
				}
			}
			return nil
		})
		if err != nil {
			return err
		}
		if validJSON {
			column = mariaDBJSONColumnType{column}
		}
	}
	if !field.HasDefaultValue || !strings.EqualFold(column.DatabaseTypeName(), "decimal") {
		return m.Migrator.MigrateColumn(value, field, column)
	}
	stored, ok := column.DefaultValue()
	if !ok {
		return m.Migrator.MigrateColumn(value, field, column)
	}
	storedNumber, storedErr := decimal.NewFromString(stored)
	modelNumber, modelErr := decimal.NewFromString(field.DefaultValue)
	if storedErr != nil || modelErr != nil || !storedNumber.Equal(modelNumber) {
		return m.Migrator.MigrateColumn(value, field, column)
	}
	// MySQL pads decimal defaults (0 -> 0.000000). Skip only the equivalent
	// default comparison, retaining type/size/null checks. AlterColumn still
	// reads the original model, including its default.
	comparisonField := *field
	comparisonField.HasDefaultValue = false
	comparisonField.DefaultValue = ""
	comparisonField.DefaultValueInterface = nil
	return m.Migrator.MigrateColumn(value, &comparisonField, columnWithoutDefault{column})
}

func (m mysqlSchemaMigrator) MigrateColumnUnique(value any, field *schema.Field, column gorm.ColumnType) error {
	if field.DBName == "active_name" && field.Schema != nil && (field.Schema.Table == "models" || field.Schema.Table == "vendors") && !field.Unique && field.UniqueIndex == "" {
		// These uniqueness keys are validated, backfilled and indexed by
		// MigrateModelVendorActiveNames after AutoMigrate. MySQL otherwise
		// mistakes the deliberately external index for a redundant constraint.
		return nil
	}
	return m.Migrator.MigrateColumnUnique(value, field, column)
}

type mariaDBJSONColumnType struct{ migrationColumnType }

func (mariaDBJSONColumnType) DatabaseTypeName() string { return "json" }

type migrationColumnType interface{ gorm.ColumnType }

type columnWithoutDefault struct{ migrationColumnType }

func (columnWithoutDefault) DefaultValue() (string, bool) { return "", false }

type postgresMigrationDialector struct{ postgres.Dialector }

func (d postgresMigrationDialector) Migrator(db *gorm.DB) gorm.Migrator {
	return postgresSchemaMigrator{d.Dialector.Migrator(db).(postgres.Migrator)}
}

type postgresSchemaMigrator struct{ postgres.Migrator }

func (m postgresSchemaMigrator) MigrateColumn(value any, field *schema.Field, column gorm.ColumnType) error {
	if column.DatabaseTypeName() == "bpchar" && strings.HasPrefix(strings.ToLower(string(field.DataType)), "char(") {
		// PostgreSQL reports CHAR(n) as bpchar. Normalize the name, retaining
		// Length() so a real CHAR length change still triggers migration.
		column = charColumnType{column}
	}
	return m.Migrator.MigrateColumn(value, field, column)
}

type charColumnType struct{ migrationColumnType }

func (charColumnType) DatabaseTypeName() string { return "char" }
