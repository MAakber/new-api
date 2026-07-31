package service

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAutoSyncSnapshotDB(t *testing.T) *gorm.DB {
	db := usePricingPatchDB(t)
	require.NoError(t, db.AutoMigrate(&model.AutoPriceGuard{}, &model.AutoSyncEvent{}, &model.AutoSyncCursor{}))
	return db
}

func putAutoSyncOption(t *testing.T, db *gorm.DB, key, value string) {
	t.Helper()
	require.NoError(t, db.Save(&model.Option{Key: key, Value: value}).Error)
}

func TestLoadChannelAutoSyncConfigTxDefaultsAndPresetSafety(t *testing.T) {
	db := setupAutoSyncSnapshotDB(t)
	err := db.Transaction(func(tx *gorm.DB) error {
		config, err := LoadChannelAutoSyncConfigTx(tx)
		require.NoError(t, err)
		require.False(t, config.PriceEnabled)
		require.False(t, config.MetadataEnabled)
		return nil
	})
	require.NoError(t, err)
	putAutoSyncOption(t, db, AutoPriceSyncEnabledOptionKey, "true")
	putAutoSyncOption(t, db, AutoPriceSyncSourceOptionKey, `{"kind":"official","resolved_base_url":"https://evil.example","endpoint":"/evil"}`)
	err = db.Transaction(func(tx *gorm.DB) error {
		config, err := LoadChannelAutoSyncConfigTx(tx)
		require.NoError(t, err)
		require.NotNil(t, config.PriceSource)
		require.Equal(t, PricingSourceOfficial, config.PriceSource.Kind)
		require.Equal(t, officialPricingBaseURL, config.PriceSource.ResolvedBaseURL)
		require.Equal(t, officialPricingEndpoint, config.PriceSource.Endpoint)
		return nil
	})
	require.NoError(t, err)
}

func TestBuildGuardAndEventsUseTxPricingRowsAndRollback(t *testing.T) {
	db := setupAutoSyncSnapshotDB(t)
	require.NoError(t, db.Model(&model.Option{}).Where("key = ?", "ModelPrice").Update("value", `{"zero":0}`).Error)
	require.NoError(t, db.Model(&model.Option{}).Where("key = ?", "ModelRatio").Update("value", `{}`).Error)
	config := ChannelAutoSyncConfig{PriceEnabled: true, MetadataEnabled: true, PriceSource: &PricingSourceDescriptor{Kind: PricingSourceModelsDev}}
	validated, err := ValidatePricingSourceDescriptor(*config.PriceSource)
	require.NoError(t, err)
	config.PriceSource = &validated
	channel := &model.Channel{Id: 42, Models: "zero, missing,missing", ModelMapping: func() *string { value := `{"missing":"mapping-only"}`; return &value }(), ConfigRevision: 7, UsedQuota: 11}
	err = db.Transaction(func(tx *gorm.DB) error {
		guard, err := BuildChannelAutoPriceGuardTx(tx, channel, config, 100)
		require.NoError(t, err)
		require.Equal(t, int64(7), guard.InitialRevision)
		require.Equal(t, int64(11), guard.InitialUsedQuota)
		require.JSONEq(t, `["missing"]`, guard.InitialMissingModels)
		require.NotZero(t, channel.AutoPriceGuardID)
		require.NoError(t, AppendChannelAutoSyncEventsTx(tx, channel, config, "create", guard, 100))
		return nil
	})
	require.NoError(t, err)
	var events []model.AutoSyncEvent
	require.NoError(t, db.Order("type").Find(&events).Error)
	require.Len(t, events, 2)
	var payload AutoPriceSyncEventPayload
	for _, event := range events {
		if event.Type == AutoPriceSyncEventType {
			require.NoError(t, json.Unmarshal([]byte(event.Payload), &payload))
			require.Equal(t, []string{"missing", "zero"}, payload.Models)
			require.NotContains(t, event.Payload, "mapping-only")
		}
	}
	require.NotContains(t, events[0].Payload+events[1].Payload, "key")

	err = db.Transaction(func(tx *gorm.DB) error {
		_, err := BuildChannelAutoPriceGuardTx(tx, channel, config, 101)
		require.NoError(t, err)
		return assertRollback{}
	})
	require.Error(t, err)
	var guards int64
	require.NoError(t, db.Model(&model.AutoPriceGuard{}).Count(&guards).Error)
	require.EqualValues(t, 1, guards)
}

func TestPriceUpdateEventDoesNotRequireGuardAndCarriesAllModels(t *testing.T) {
	db := setupAutoSyncSnapshotDB(t)
	config := ChannelAutoSyncConfig{PriceEnabled: true, PriceSource: &PricingSourceDescriptor{Kind: PricingSourceModelsDev}}
	source, err := ValidatePricingSourceDescriptor(*config.PriceSource)
	require.NoError(t, err)
	config.PriceSource = &source
	channel := &model.Channel{Id: 8, Models: "already-priced, auxiliary-only", ModelMapping: func() *string { value := `{"wrong":"mapping-only"}`; return &value }()}
	err = db.Transaction(func(tx *gorm.DB) error { return AppendChannelAutoSyncEventsTx(tx, channel, config, "update", nil, 10) })
	require.NoError(t, err)
	var event model.AutoSyncEvent
	require.NoError(t, db.Where("type = ?", AutoPriceSyncEventType).First(&event).Error)
	var payload AutoPriceSyncEventPayload
	require.NoError(t, json.Unmarshal([]byte(event.Payload), &payload))
	require.Zero(t, payload.GuardID)
	require.Equal(t, []string{"already-priced", "auxiliary-only"}, payload.Models)
	require.NotContains(t, event.Payload, "mapping-only")
}

func TestPriceEventSnapshotBoundaryRollsBack(t *testing.T) {
	db := setupAutoSyncSnapshotDB(t)
	config := ChannelAutoSyncConfig{PriceEnabled: true, PriceSource: &PricingSourceDescriptor{Kind: PricingSourceModelsDev}}
	source, err := ValidatePricingSourceDescriptor(*config.PriceSource)
	require.NoError(t, err)
	config.PriceSource = &source
	models := make([]string, maxAutoSyncSnapshotModels+1)
	for i := range models {
		models[i] = "model-" + strconv.Itoa(i)
	}
	channel := &model.Channel{Id: 9, Models: strings.Join(models, ",")}
	err = db.Transaction(func(tx *gorm.DB) error { return AppendChannelAutoSyncEventsTx(tx, channel, config, "update", nil, 10) })
	require.Error(t, err)
	var count int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestAppendChannelAutoSyncEventsHonorsIndependentSwitches(t *testing.T) {
	db := setupAutoSyncSnapshotDB(t)
	channel := &model.Channel{Id: 5}
	err := db.Transaction(func(tx *gorm.DB) error {
		return AppendChannelAutoSyncEventsTx(tx, channel, ChannelAutoSyncConfig{MetadataEnabled: true}, "update", nil, 10)
	})
	require.NoError(t, err)
	var events []model.AutoSyncEvent
	require.NoError(t, db.Find(&events).Error)
	require.Len(t, events, 1)
	require.Equal(t, AutoModelMetadataSyncEventType, events[0].Type)
}

type assertRollback struct{}

func (assertRollback) Error() string { return "rollback" }
