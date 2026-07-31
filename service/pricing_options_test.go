package service

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePricingPatchDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	previousDB := model.DB
	model.DB = db
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	t.Cleanup(func() { model.DB, common.OptionMap = previousDB, previousOptions })
	require.NoError(t, model.SeedCanonicalPricingOptions())
	return db
}

func expectedMissing() *PricingExpectedValue { return &PricingExpectedValue{Present: false} }

func TestPatchPricingOptionsZeroDeleteAndSetIfMissing(t *testing.T) {
	db := usePricingPatchDB(t)
	result, err := PatchPricingOptions([]PricingPatchOperation{{Key: "ModelPrice", Model: "zero", Action: PricingPatchSet, Value: json.RawMessage("0"), Expected: expectedMissing()}})
	require.NoError(t, err)
	var values map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(result["ModelPrice"]), &values))
	require.Equal(t, "0", string(values["zero"]))

	_, err = PatchPricingOptions([]PricingPatchOperation{{Key: "ModelPrice", Model: "zero", Action: PricingPatchSetIfMissing, Value: json.RawMessage("1")}})
	require.NoError(t, err)
	var stored model.Option
	require.NoError(t, db.First(&stored, "key = ?", "ModelPrice").Error)
	require.Contains(t, stored.Value, `"zero":0`)

	_, err = PatchPricingOptions([]PricingPatchOperation{{Key: "ModelPrice", Model: "zero", Action: PricingPatchDelete, Expected: &PricingExpectedValue{Present: true, Value: json.RawMessage("0")}}})
	require.NoError(t, err)
	_, err = PatchPricingOptions([]PricingPatchOperation{{Key: "ModelPrice", Model: "zero", Action: PricingPatchDelete, Expected: &PricingExpectedValue{Present: true, Value: json.RawMessage("0")}}})
	require.ErrorIs(t, err, ErrPricingPatchConflict)
}

func TestPatchPricingOptionsIsAtomicOnExpectedConflict(t *testing.T) {
	db := usePricingPatchDB(t)
	_, err := PatchPricingOptions([]PricingPatchOperation{
		{Key: "ModelPrice", Model: "first", Action: PricingPatchSet, Value: json.RawMessage("1"), Expected: expectedMissing()},
		{Key: "ModelRatio", Model: "second", Action: PricingPatchSet, Value: json.RawMessage("2"), Expected: &PricingExpectedValue{Present: true, Value: json.RawMessage("9")}},
	})
	require.ErrorIs(t, err, ErrPricingPatchConflict)
	var option model.Option
	require.NoError(t, db.First(&option, "key = ?", "ModelPrice").Error)
	require.NotContains(t, option.Value, "first")
}

func TestPatchPricingOptionsMissingRowIsIntegrityError(t *testing.T) {
	db := usePricingPatchDB(t)
	require.NoError(t, db.Delete(&model.Option{}, "key = ?", "AudioRatio").Error)
	_, err := PatchPricingOptions([]PricingPatchOperation{{Key: "ModelPrice", Model: "x", Action: PricingPatchSet, Value: json.RawMessage("1"), Expected: expectedMissing()}})
	require.True(t, errors.Is(err, model.ErrPricingOptionIntegrity))
}
