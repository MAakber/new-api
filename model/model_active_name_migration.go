package model

import (
	"fmt"
	"strings"

	"gorm.io/gorm"
)

const (
	modelActiveNameIndex  = "uk_model_active_name"
	vendorActiveNameIndex = "uk_vendor_active_name"
)

type modelActiveNameIndexSchema struct {
	ActiveName *string `gorm:"column:active_name;size:128;uniqueIndex:uk_model_active_name"`
}

func (modelActiveNameIndexSchema) TableName() string { return "models" }

type vendorActiveNameIndexSchema struct {
	ActiveName *string `gorm:"column:active_name;size:128;uniqueIndex:uk_vendor_active_name"`
}

func (vendorActiveNameIndexSchema) TableName() string { return "vendors" }

// MigrateModelVendorActiveNames backfills the active-name uniqueness keys after
// AutoMigrate has added their columns. It refuses to choose a winner when old
// active rows have duplicate names.
func MigrateModelVendorActiveNames() error {
	if err := migrateActiveNames(&Model{}, &modelActiveNameIndexSchema{}, "models", "model_name", modelActiveNameIndex, "uk_model_name_delete_at"); err != nil {
		return err
	}
	return migrateActiveNames(&Vendor{}, &vendorActiveNameIndexSchema{}, "vendors", "name", vendorActiveNameIndex, "uk_vendor_name_delete_at")
}

func migrateActiveNames(value interface{}, indexSchema interface{}, table, nameColumn, activeIndex, legacyIndex string) error {
	migrator := DB.Migrator()
	if !migrator.HasTable(value) {
		return fmt.Errorf("active-name migration: %s table does not exist", table)
	}
	if !migrator.HasColumn(value, "active_name") {
		return fmt.Errorf("active-name migration: %s.active_name column does not exist; run AutoMigrate first", table)
	}

	var duplicateNames []string
	if err := DB.Table(table).
		Select(nameColumn).
		Where("deleted_at IS NULL").
		Group(nameColumn).
		Having("COUNT(*) > 1").
		Pluck(nameColumn, &duplicateNames).Error; err != nil {
		return err
	}
	if len(duplicateNames) > 0 {
		return fmt.Errorf("active-name migration: %s has duplicate active %s values: %s", table, nameColumn, strings.Join(duplicateNames, ", "))
	}

	if err := DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Table(table).Where("deleted_at IS NOT NULL").Update("active_name", nil).Error; err != nil {
			return err
		}
		if err := tx.Table(table).Where("deleted_at IS NULL").Update("active_name", gorm.Expr(nameColumn)).Error; err != nil {
			return err
		}
		return nil
	}); err != nil {
		return err
	}
	if migrator.HasIndex(value, legacyIndex) {
		if err := migrator.DropIndex(value, legacyIndex); err != nil {
			return err
		}
	}
	if !migrator.HasIndex(value, activeIndex) {
		if err := migrator.CreateIndex(indexSchema, activeIndex); err != nil {
			return err
		}
	}
	return nil
}
