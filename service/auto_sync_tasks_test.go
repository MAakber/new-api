package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAutoSyncTaskDB(t *testing.T) {
	t.Helper()
	db := setupChannelMutationDB(t, true)
	require.NoError(t, db.AutoMigrate(&model.Log{}, &model.NamedLease{}, &model.Model{}, &model.Vendor{}, &model.SystemTask{}, &model.SystemTaskLock{}))
	previousLogDB := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() { model.LOG_DB = previousLogDB })
}

func configureRealAutoPriceSource(t *testing.T, sourceChannelID int, sourceType int, baseURL string) {
	t.Helper()
	source := PricingSourceDescriptor{Kind: PricingSourceRealChannel, ChannelID: sourceChannelID, ChannelType: sourceType, ResolvedBaseURL: baseURL, Endpoint: "/pricing"}
	encoded, err := json.Marshal(source)
	require.NoError(t, err)
	putAutoSyncOption(t, model.DB, AutoPriceSyncEnabledOptionKey, "true")
	putAutoSyncOption(t, model.DB, AutoPriceSyncSourceOptionKey, string(encoded))
}

func useTLSTestTransport(t *testing.T, server *httptest.Server) {
	t.Helper()
	previous := http.DefaultTransport
	http.DefaultTransport = server.Client().Transport
	t.Cleanup(func() { http.DefaultTransport = previous })
}

func latestAutoSyncCutoff(t *testing.T, eventType string) int64 {
	t.Helper()
	var event model.AutoSyncEvent
	require.NoError(t, model.DB.Where("type = ?", eventType).Order("generation DESC").First(&event).Error)
	return event.Generation
}

func TestRunAutoPriceSyncBatchFillsAndRetainsCreatedChannel(t *testing.T) {
	setupAutoSyncTaskDB(t)
	modelName := "auto-price-fill-model"
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"` + modelName + `","quota_type":1,"model_price":2}]}`))
	}))
	t.Cleanup(server.Close)
	useTLSTestTransport(t, server)
	baseURL := server.URL
	source := model.Channel{Id: 7001, Type: 1, Key: "source-secret", BaseURL: &baseURL, Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(&source).Error)
	configureRealAutoPriceSource(t, source.Id, source.Type, server.URL)

	created, err := CreateChannels([]model.Channel{{Key: "target-secret", Name: "target", Models: modelName, Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	require.Len(t, created, 1)
	outcome, err := RunAutoPriceSyncBatch(context.Background(), latestAutoSyncCutoff(t, AutoPriceSyncEventType))
	require.NoError(t, err)
	require.False(t, outcome.Failed)
	require.GreaterOrEqual(t, outcome.Summary.PricesFilled, 1)
	require.Contains(t, outcome.Summary.RetainedChannels, created[0].Id)
	var stored model.Channel
	require.NoError(t, model.DB.First(&stored, created[0].Id).Error)
	var guard model.AutoPriceGuard
	require.NoError(t, model.DB.First(&guard, created[0].AutoPriceGuardID).Error)
	require.Equal(t, model.AutoPriceGuardStateResolved, guard.State)
}

func TestRunAutoPriceSyncBatchDeletesUnchangedUnusedChannelWithoutPrice(t *testing.T) {
	setupAutoSyncTaskDB(t)
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"success":true,"data":[]}`))
	}))
	t.Cleanup(server.Close)
	useTLSTestTransport(t, server)
	baseURL := server.URL
	source := model.Channel{Id: 7101, Type: 1, Key: "source-secret", BaseURL: &baseURL, Status: common.ChannelStatusEnabled}
	require.NoError(t, model.DB.Create(&source).Error)
	configureRealAutoPriceSource(t, source.Id, source.Type, server.URL)

	created, err := CreateChannels([]model.Channel{{Key: "target-secret", Name: "delete-target", Models: "auto-price-delete-model", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	outcome, err := RunAutoPriceSyncBatch(context.Background(), latestAutoSyncCutoff(t, AutoPriceSyncEventType))
	require.NoError(t, err)
	require.Contains(t, outcome.Summary.DeletedChannels, created[0].Id)
	var count int64
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", created[0].Id).Count(&count).Error)
	require.Zero(t, count)
	var guard model.AutoPriceGuard
	require.NoError(t, model.DB.First(&guard, created[0].AutoPriceGuardID).Error)
	require.Equal(t, model.AutoPriceGuardStateDeleted, guard.State)
}

func TestRunAutoModelMetadataSyncBatchCreatesMissingModel(t *testing.T) {
	setupAutoSyncTaskDB(t)
	modelName := "auto-metadata-model"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/newapi/models.json" {
			_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"` + modelName + `","vendor_name":"auto-vendor"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":[{"name":"auto-vendor"}]}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	require.NoError(t, model.DB.Create(&model.Ability{Group: "default", Model: modelName, ChannelId: 8801, Enabled: true}).Error)
	event := &model.AutoSyncEvent{Type: AutoModelMetadataSyncEventType, ChannelID: 8801, Trigger: "create", Payload: `{}`, EventAt: 100}
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error { return model.AppendAutoSyncEventTx(tx, event) }))

	outcome, err := RunAutoModelMetadataSyncBatch(context.Background(), event.Generation)
	require.NoError(t, err)
	require.False(t, outcome.Failed)
	require.Equal(t, 1, outcome.Summary.CreatedModels)
	var created model.Model
	require.NoError(t, model.DB.Where("model_name = ?", modelName).First(&created).Error)
	require.Equal(t, 1, created.SyncOfficial)
}

func TestAutoSyncStatusDoesNotExposeTaskPayloadOrLockOwner(t *testing.T) {
	setupAutoSyncTaskDB(t)
	putAutoSyncOption(t, model.DB, AutoModelMetadataSyncEnabledOptionKey, "true")
	event := &model.AutoSyncEvent{Type: AutoModelMetadataSyncEventType, ChannelID: 1, Trigger: "create", Payload: `{}`, EventAt: 100}
	require.NoError(t, model.DB.Transaction(func(tx *gorm.DB) error { return model.AppendAutoSyncEventTx(tx, event) }))
	task, err := model.CreateSystemTask(AutoModelMetadataSyncEventType, map[string]string{"secret": "must-not-leak"}, nil)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.SystemTask{}).Where("id = ?", task.ID).Update("locked_by", "private-runner").Error)

	status, err := GetAutoModelSyncStatus()
	require.NoError(t, err)
	encoded, err := json.Marshal(status)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "must-not-leak")
	require.NotContains(t, string(encoded), "private-runner")
	require.EqualValues(t, 1, status.Status.PendingEvents)
}

func TestAutoPriceSyncConfigCanDisableOrRepairInvalidStoredSource(t *testing.T) {
	setupAutoSyncTaskDB(t)
	putAutoSyncOption(t, model.DB, AutoPriceSyncEnabledOptionKey, "true")
	putAutoSyncOption(t, model.DB, AutoPriceSyncSourceOptionKey, `{"kind":"real_channel","channel_id":0,"resolved_base_url":"http://unsafe"}`)
	require.NoError(t, UpdateAutoPriceSyncConfig(false, nil))
	require.NoError(t, UpdateAutoPriceSyncConfig(true, &PricingSourceDescriptor{Kind: PricingSourceOfficial}))
	status, err := GetAutoPriceSyncStatus()
	require.NoError(t, err)
	require.True(t, status.Config.Enabled)
	require.Equal(t, PricingSourceOfficial, status.Config.Source.Kind)
}
