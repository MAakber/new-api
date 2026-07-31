package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupAutoSyncControllerDB(t *testing.T) {
	t.Helper()
	db := usePricingControllerDB(t)
	require.NoError(t, db.AutoMigrate(&model.AutoSyncEvent{}, &model.AutoSyncCursor{}, &model.SystemTask{}, &model.SystemTaskLock{}))
}

func performAutoSyncRequest(t *testing.T, method, path, body string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(method, path, bytes.NewBufferString(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", 1)
	ctx.Set("role", 100)
	handler(ctx)
	return recorder
}

func TestAutoPriceSyncConfigRequiresSourceAndDoesNotEnqueue(t *testing.T) {
	setupAutoSyncControllerDB(t)
	missing := performAutoSyncRequest(t, http.MethodPatch, "/api/auto-sync/pricing", `{"enabled":true}`, UpdateAutoPriceSyncConfig)
	require.Equal(t, http.StatusBadRequest, missing.Code)

	success := performAutoSyncRequest(t, http.MethodPatch, "/api/auto-sync/pricing", `{"enabled":true,"source":{"kind":"official","resolved_base_url":"https://evil.example","endpoint":"/evil"}}`, UpdateAutoPriceSyncConfig)
	require.Equal(t, http.StatusOK, success.Code)
	var response struct {
		Success bool                            `json:"success"`
		Data    service.AutoPriceSyncStatusView `json:"data"`
	}
	require.NoError(t, json.Unmarshal(success.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.True(t, response.Data.Config.Enabled)
	require.NotNil(t, response.Data.Config.Source)
	require.Equal(t, service.PricingSourceOfficial, response.Data.Config.Source.Kind)
	require.NotEqual(t, "https://evil.example", response.Data.Config.Source.ResolvedBaseURL)
	var events int64
	require.NoError(t, model.DB.Model(&model.AutoSyncEvent{}).Count(&events).Error)
	require.Zero(t, events)
}

func TestAutoModelSyncConfigAndStatus(t *testing.T) {
	setupAutoSyncControllerDB(t)
	update := performAutoSyncRequest(t, http.MethodPatch, "/api/auto-sync/model-metadata", `{"enabled":true}`, UpdateAutoModelSyncConfig)
	require.Equal(t, http.StatusOK, update.Code)
	status := performAutoSyncRequest(t, http.MethodGet, "/api/auto-sync/model-metadata", "", GetAutoModelSyncStatus)
	require.Equal(t, http.StatusOK, status.Code)
	require.Contains(t, status.Body.String(), `"enabled":true`)
	require.NotContains(t, status.Body.String(), "payload")
	require.NotContains(t, status.Body.String(), "locked_by")
}
