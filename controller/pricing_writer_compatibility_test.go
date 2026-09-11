package controller

import (
	"encoding/json"
	"net/http"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingWriterCompatibilityDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			t.Run("builtin_display_does_not_change_raw_CAS_values", func(t *testing.T) {
				before, err := model.RefreshPricingOptionMapsFromDatabase()
				require.NoError(t, err)
				var response struct {
					Success bool                       `json:"success"`
					Data    model.ModelPricingSnapshot `json:"data"`
				}
				modelManagementRequest(t, GetModelPricingConfig, http.MethodGet, "/api/option/model_pricing?model=gpt-6-astra", nil, &response)
				require.True(t, response.Success)
				require.Len(t, response.Data.Entries, 1)
				entry := response.Data.Entries[0]
				assert.Empty(t, entry.Configured)
				assert.Equal(t, "tiered_expr", entry.Effective["billing_setting.billing_mode"])
				assert.NotEmpty(t, entry.Effective["billing_setting.billing_expr"])
				assert.Equal(t, response.Data.EmptyVersion, entry.Version)
				after, err := model.RefreshPricingOptionMapsFromDatabase()
				require.NoError(t, err)
				assert.Equal(t, before, after, "display defaults must not become administrator overrides")
				var options struct {
					Success bool           `json:"success"`
					Data    []model.Option `json:"data"`
				}
				modelManagementRequest(t, GetOptions, http.MethodGet, "/api/option/", nil, &options)
				require.True(t, options.Success)
				for _, option := range options.Data {
					if model.IsPricingOptionKey(option.Key) {
						assert.Equal(t, before[option.Key], option.Value)
					}
				}
			})
			t.Run("different_models_survive_concurrent_old_and_new_writers", func(t *testing.T) {
				snapshot, err := model.GetModelPricingSnapshot([]string{"mixed-new", "mixed-old"})
				require.NoError(t, err)
				start := make(chan struct{})
				results := make(chan error, 2)
				go func() {
					<-start
					_, err := service.PatchPricingOptions([]service.PricingPatchOperation{{Key: "ModelPrice", Model: "mixed-old", Action: service.PricingPatchSet, Value: json.RawMessage("0"), Expected: &service.PricingExpectedValue{}}})
					results <- err
				}()
				go func() {
					<-start
					results <- model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: "mixed-new", ExpectedVersion: snapshot.EmptyVersion, Pricing: model.PricingValues{"ModelPrice": float64(2)}}})
				}()
				close(start)
				first, second := <-results, <-results
				require.NoError(t, first)
				require.NoError(t, second)
				after, err := model.GetModelPricingSnapshot([]string{"mixed-new", "mixed-old"})
				require.NoError(t, err)
				assert.Equal(t, float64(2), after.Entries[0].Configured["ModelPrice"])
				assert.Equal(t, float64(0), after.Entries[1].Configured["ModelPrice"])
				var runtime map[string]float64
				require.NoError(t, common.UnmarshalJsonStr(common.OptionMap["ModelPrice"], &runtime))
				assert.Equal(t, float64(2), runtime["mixed-new"])
				zero, exists := runtime["mixed-old"]
				assert.True(t, exists)
				assert.Zero(t, zero)
			})
			t.Run("same_model_has_one_winner_and_both_APIs_reject_stale_edits", func(t *testing.T) {
				before, err := model.GetModelPricingSnapshot([]string{"mixed-race"})
				require.NoError(t, err)
				patch := []service.PricingPatchOperation{{Key: "ModelPrice", Model: "mixed-race", Action: service.PricingPatchSet, Value: json.RawMessage("3"), Expected: &service.PricingExpectedValue{}}}
				changes := []model.ModelPricingChange{{ModelName: "mixed-race", ExpectedVersion: before.EmptyVersion, Pricing: model.PricingValues{"ModelPrice": float64(4)}}}
				start := make(chan struct{})
				legacyResult, versionedResult := make(chan error, 1), make(chan error, 1)
				go func() {
					<-start
					_, err := service.PatchPricingOptions(patch)
					legacyResult <- err
				}()
				go func() {
					<-start
					versionedResult <- model.UpdateModelPricing(changes)
				}()
				close(start)
				legacyErr, versionedErr := <-legacyResult, <-versionedResult
				after, err := model.GetModelPricingSnapshot([]string{"mixed-race"})
				require.NoError(t, err)
				if legacyErr == nil {
					assert.ErrorIs(t, versionedErr, model.ErrModelPricingConflict)
					assert.Equal(t, float64(3), after.Entries[0].Configured["ModelPrice"])
				} else {
					require.NoError(t, versionedErr)
					assert.ErrorIs(t, legacyErr, service.ErrPricingPatchConflict)
					assert.Equal(t, float64(4), after.Entries[0].Configured["ModelPrice"])
				}
				legacy := modelManagementRequest(t, PatchPricingOptions, http.MethodPatch, "/api/option/pricing/patch", pricingPatchRequest{Operations: patch}, nil)
				assert.Equal(t, http.StatusConflict, legacy.Code)
				versioned := modelManagementRequest(t, UpdateModelPricingConfig, http.MethodPut, "/api/option/model_pricing", map[string]any{"changes": changes}, nil)
				assert.Equal(t, http.StatusConflict, versioned.Code)
			})
			t.Run("missing_canonical_row_rejects_both_writers_without_partial_writes", func(t *testing.T) {
				var row model.Option
				require.NoError(t, db.Where(&model.Option{Key: "AudioRatio"}).First(&row).Error)
				require.NoError(t, db.Where(&model.Option{Key: row.Key}).Delete(&model.Option{}).Error)
				t.Cleanup(func() { require.NoError(t, db.Create(&row).Error) })
				_, err := service.PatchPricingOptions([]service.PricingPatchOperation{{Key: "ModelPrice", Model: "missing-row", Action: service.PricingPatchSetIfMissing, Value: json.RawMessage("1")}})
				assert.ErrorIs(t, err, model.ErrPricingOptionIntegrity)
				err = model.UpdateModelPricing([]model.ModelPricingChange{{ModelName: "missing-row", ExpectedVersion: model.ModelPricingVersion(model.PricingValues{}), Pricing: model.PricingValues{"ModelPrice": float64(2)}}})
				assert.ErrorIs(t, err, model.ErrPricingOptionIntegrity)
				_, err = model.GetModelPricingSnapshot([]string{"missing-row"})
				assert.ErrorIs(t, err, model.ErrPricingOptionIntegrity)
				var persisted model.Option
				require.NoError(t, db.Where(&model.Option{Key: "ModelPrice"}).First(&persisted).Error)
				var prices map[string]float64
				require.NoError(t, common.UnmarshalJsonStr(persisted.Value, &prices))
				assert.NotContains(t, prices, "missing-row")
				var count int64
				require.NoError(t, db.Model(&model.Option{}).Where(&model.Option{Key: row.Key}).Count(&count).Error)
				assert.Zero(t, count, "writers cannot silently recreate a damaged canonical row")
			})
		})
	}
}
