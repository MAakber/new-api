package model

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useActiveNameTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	db, err := gorm.Open(sqlite.Open(fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&Model{}, &Vendor{}))
	DB = db
	t.Cleanup(func() {
		DB = previousDB
		_ = sqlDB.Close()
	})
	return db
}

func TestMigrateModelVendorActiveNamesRejectsDuplicateActiveNames(t *testing.T) {
	db := useActiveNameTestDB(t)
	require.NoError(t, db.Create(&Model{ModelName: "duplicate"}).Error)
	require.NoError(t, db.Create(&Model{ModelName: "duplicate"}).Error)
	err := MigrateModelVendorActiveNames()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "models has duplicate active model_name values: duplicate")

	require.NoError(t, db.Exec("DELETE FROM models").Error)
	require.NoError(t, db.Create(&Vendor{Name: "duplicate"}).Error)
	require.NoError(t, db.Create(&Vendor{Name: "duplicate"}).Error)
	err = MigrateModelVendorActiveNames()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "vendors has duplicate active name values: duplicate")
}

func TestActiveNameConcurrentCreateLeavesOneActive(t *testing.T) {
	db := useActiveNameTestDB(t)
	require.NoError(t, MigrateModelVendorActiveNames())
	const attempts = 12
	var wg sync.WaitGroup
	errs := make(chan error, attempts)
	for range attempts {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- (&Model{ModelName: "concurrent"}).Insert()
		}()
	}
	wg.Wait()
	close(errs)

	successes := 0
	for err := range errs {
		if err == nil {
			successes++
		}
	}
	assert.Equal(t, attempts, successes, "unique conflicts reselect the active record")
	var count int64
	require.NoError(t, db.Model(&Model{}).Where("active_name = ?", "concurrent").Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestActiveNameDeleteAllowsRecreate(t *testing.T) {
	useActiveNameTestDB(t)
	require.NoError(t, MigrateModelVendorActiveNames())
	model := &Model{ModelName: "recreate-model"}
	require.NoError(t, model.Insert())
	require.NoError(t, model.Delete())
	require.NoError(t, (&Model{ModelName: "recreate-model"}).Insert())

	vendor := &Vendor{Name: "recreate-vendor"}
	require.NoError(t, vendor.Insert())
	require.NoError(t, vendor.Delete())
	require.NoError(t, (&Vendor{Name: "recreate-vendor"}).Insert())
}

func TestActiveNameRenameConflictReturnsDatabaseError(t *testing.T) {
	useActiveNameTestDB(t)
	require.NoError(t, MigrateModelVendorActiveNames())
	firstModel := &Model{ModelName: "model-a"}
	require.NoError(t, firstModel.Insert())
	secondModel := &Model{ModelName: "model-b"}
	require.NoError(t, secondModel.Insert())
	secondModel.ModelName = firstModel.ModelName
	require.Error(t, secondModel.Update())

	firstVendor := &Vendor{Name: "vendor-a"}
	require.NoError(t, firstVendor.Insert())
	secondVendor := &Vendor{Name: "vendor-b"}
	require.NoError(t, secondVendor.Insert())
	secondVendor.Name = firstVendor.Name
	require.Error(t, secondVendor.Update())
}

func TestModelVendorInsertReselectsActiveRecordAfterUniqueConflict(t *testing.T) {
	useActiveNameTestDB(t)
	require.NoError(t, MigrateModelVendorActiveNames())
	firstModel := &Model{ModelName: "same-model"}
	require.NoError(t, firstModel.Insert())
	secondModel := &Model{ModelName: "same-model"}
	require.NoError(t, secondModel.Insert())
	assert.Equal(t, firstModel.Id, secondModel.Id)

	firstVendor := &Vendor{Name: "same-vendor"}
	require.NoError(t, firstVendor.Insert())
	secondVendor := &Vendor{Name: "same-vendor"}
	require.NoError(t, secondVendor.Insert())
	assert.Equal(t, firstVendor.Id, secondVendor.Id)
}

func TestMigrateModelVendorActiveNamesBackfillsThenCreatesIndexes(t *testing.T) {
	db := useActiveNameTestDB(t)
	modelName := "model"
	vendorName := "vendor"
	require.NoError(t, db.Create(&Model{ModelName: modelName}).Error)
	require.NoError(t, db.Create(&Vendor{Name: vendorName}).Error)
	assert.False(t, db.Migrator().HasIndex(&Model{}, modelActiveNameIndex))
	assert.False(t, db.Migrator().HasIndex(&Vendor{}, vendorActiveNameIndex))

	require.NoError(t, MigrateModelVendorActiveNames())
	assert.True(t, db.Migrator().HasIndex(&Model{}, modelActiveNameIndex))
	assert.True(t, db.Migrator().HasIndex(&Vendor{}, vendorActiveNameIndex))
	var storedModel Model
	var storedVendor Vendor
	require.NoError(t, db.First(&storedModel).Error)
	require.NoError(t, db.First(&storedVendor).Error)
	require.NotNil(t, storedModel.ActiveName)
	require.NotNil(t, storedVendor.ActiveName)
	assert.Equal(t, modelName, *storedModel.ActiveName)
	assert.Equal(t, vendorName, *storedVendor.ActiveName)
}

func TestMigrateModelVendorActiveNamesAllowsMultipleSoftDeletedNames(t *testing.T) {
	db := useActiveNameTestDB(t)
	deletedAt := gorm.DeletedAt{Time: time.Now(), Valid: true}
	require.NoError(t, db.Unscoped().Create(&Model{ModelName: "old-model", DeletedAt: deletedAt}).Error)
	require.NoError(t, db.Unscoped().Create(&Model{ModelName: "old-model", DeletedAt: deletedAt}).Error)
	require.NoError(t, db.Unscoped().Create(&Vendor{Name: "old-vendor", DeletedAt: deletedAt}).Error)
	require.NoError(t, db.Unscoped().Create(&Vendor{Name: "old-vendor", DeletedAt: deletedAt}).Error)
	require.NoError(t, MigrateModelVendorActiveNames())

	require.NoError(t, (&Model{ModelName: "old-model"}).Insert())
	require.NoError(t, (&Vendor{Name: "old-vendor"}).Insert())
}
