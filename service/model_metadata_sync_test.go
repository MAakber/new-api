package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useMetadataSyncTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previous := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Ability{}, &model.Model{}, &model.Vendor{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
	return db
}

func TestCanonicalModelMetadataURLsUsesDefaultPathForEmptyLocale(t *testing.T) {
	t.Setenv("SYNC_UPSTREAM_BASE", "https://metadata.example/")
	source := CanonicalModelMetadataURLs("")
	assert.Empty(t, source.Locale)
	assert.Equal(t, "https://metadata.example/api/newapi/models.json", source.ModelsURL)
	assert.Equal(t, "https://metadata.example/api/newapi/vendors.json", source.VendorsURL)
}

func TestSyncModelMetadataFetchFailureDoesNotWrite(t *testing.T) {
	db := useMetadataSyncTestDB(t)
	require.NoError(t, db.Create(&model.Ability{Model: "missing", Enabled: true}).Error)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { http.Error(w, "failed", http.StatusBadGateway) }))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	_, err := SyncModelMetadata(context.Background(), ModelMetadataSyncOptions{CreateMissingOnly: true})
	require.Error(t, err)
	var count int64
	require.NoError(t, db.Model(&model.Model{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestFetchMetadataRejectsUnsuccessfulModelsEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"success":false,"data":[]}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	_, _, _, err := fetchMetadata(context.Background(), "")
	require.ErrorContains(t, err, "unsuccessful")
}

func TestFetchMetadataAcceptsLegacyArrays(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/newapi/models.json" {
			_, _ = w.Write([]byte(`[{"model_name":"legacy"}]`))
			return
		}
		_, _ = w.Write([]byte(`[{"name":"vendor"}]`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	models, vendors, _, err := fetchMetadata(context.Background(), "")
	require.NoError(t, err)
	require.Len(t, models, 1)
	require.Len(t, vendors, 1)
}

func TestFetchMetadataRetryClearsPreviousError(t *testing.T) {
	var modelRequests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/newapi/models.json" {
			if atomic.AddInt32(&modelRequests, 1) == 1 {
				http.Error(w, "retry", http.StatusBadGateway)
				return
			}
			_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"retried"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":[]}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	t.Setenv("SYNC_HTTP_RETRY", "2")
	models, _, _, err := fetchMetadata(context.Background(), "")
	require.NoError(t, err)
	require.Len(t, models, 1)
	assert.Equal(t, "retried", models[0].ModelName)
}

func TestSyncModelMetadataCreatesOfficialModel(t *testing.T) {
	db := useMetadataSyncTestDB(t)
	require.NoError(t, db.Create(&model.Ability{Model: "created", Enabled: true}).Error)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/newapi/models.json" {
			_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"created","vendor_name":"vendor"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":[{"name":"vendor"}]}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	_, err := SyncModelMetadata(context.Background(), ModelMetadataSyncOptions{CreateMissingOnly: true})
	require.NoError(t, err)
	var created model.Model
	require.NoError(t, db.Where("model_name = ?", "created").First(&created).Error)
	assert.Equal(t, 1, created.SyncOfficial)
}

func TestSyncModelMetadataCanceledContextDoesNotWrite(t *testing.T) {
	db := useMetadataSyncTestDB(t)
	require.NoError(t, db.Create(&model.Ability{Model: "missing", Enabled: true}).Error)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := SyncModelMetadata(ctx, ModelMetadataSyncOptions{CreateMissingOnly: true})
	require.ErrorIs(t, err, context.Canceled)
	var count int64
	require.NoError(t, db.Model(&model.Model{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestSyncModelMetadataStopsAfterCancellationBetweenMutations(t *testing.T) {
	db := useMetadataSyncTestDB(t)
	require.NoError(t, db.Create(&model.Ability{Model: "first", Enabled: true}).Error)
	require.NoError(t, db.Create(&model.Ability{Model: "second", Enabled: true}).Error)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/newapi/models.json" {
			_, _ = w.Write([]byte(`{"success":true,"data":[{"model_name":"first"},{"model_name":"second"}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"success":true,"data":[]}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	var modelCreates atomic.Int32
	require.NoError(t, db.Callback().Create().After("gorm:create").Register("cancel-after-first-metadata-model", func(tx *gorm.DB) {
		if tx.Statement.Schema != nil && tx.Statement.Schema.Table == "models" && modelCreates.Add(1) == 1 {
			cancel()
		}
	}))
	_, err := SyncModelMetadata(ctx, ModelMetadataSyncOptions{CreateMissingOnly: true})
	require.ErrorIs(t, err, context.Canceled)
	var count int64
	require.NoError(t, db.Model(&model.Model{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}

func TestSyncModelMetadataNoOpDoesNotFetch(t *testing.T) {
	useMetadataSyncTestDB(t)
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests++ }))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL)
	summary, err := SyncModelMetadata(context.Background(), ModelMetadataSyncOptions{})
	require.NoError(t, err)
	assert.Zero(t, requests)
	assert.Equal(t, server.URL+"/api/newapi/models.json", summary.Source.ModelsURL)
}
