package model

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePricingOptionDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Option{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	return db
}

func TestSeedCanonicalPricingOptionsOnlyAddsMissingRows(t *testing.T) {
	db := usePricingOptionDB(t)
	require.NoError(t, SeedCanonicalPricingOptions())
	defaults := CanonicalPricingOptionDefaults()
	for _, key := range PricingOptionKeys {
		var seeded Option
		require.NoError(t, db.First(&seeded, "key = ?", key).Error)
		require.JSONEq(t, defaults[key], seeded.Value, key)
	}
	var count int64
	require.NoError(t, db.Model(&Option{}).Where("key IN ?", PricingOptionKeys).Count(&count).Error)
	require.EqualValues(t, len(PricingOptionKeys), count)

	custom := `{"custom":0}`
	require.NoError(t, db.Model(&Option{}).Where("key = ?", "ModelPrice").Update("value", custom).Error)
	require.NoError(t, db.Delete(&Option{}, "key = ?", "AudioRatio").Error)
	require.NoError(t, SeedCanonicalPricingOptions())
	var price Option
	require.NoError(t, db.First(&price, "key = ?", "ModelPrice").Error)
	require.Equal(t, custom, price.Value)
	var audio Option
	require.NoError(t, db.First(&audio, "key = ?", "AudioRatio").Error)
	require.JSONEq(t, defaults["AudioRatio"], audio.Value)

	before, err := AllOption()
	require.NoError(t, err)
	require.NoError(t, SeedCanonicalPricingOptions())
	after, err := AllOption()
	require.NoError(t, err)
	require.Equal(t, before, after)
}

func TestGenericPricingWritesAreRejected(t *testing.T) {
	usePricingOptionDB(t)
	require.ErrorIs(t, UpdateOption("ModelPrice", `{}`), ErrPricingOptionRequiresPatch)
	require.ErrorIs(t, UpdateOptionsBulk(map[string]string{"ModelRatio": `{}`}), ErrPricingOptionRequiresPatch)
}

func TestApplyPricingOptionMapsRequiresAllRows(t *testing.T) {
	previous := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { common.OptionMap = previous })
	require.ErrorIs(t, ApplyPricingOptionMaps(map[string]string{}), ErrPricingOptionIntegrity)
}

func TestPricingIntegrityErrorIsStable(t *testing.T) {
	require.True(t, errors.Is(ErrPricingOptionIntegrity, ErrPricingOptionIntegrity))
}
