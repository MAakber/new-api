package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeleteModelAndVendorMetaClearActiveNameBeforeSoftDelete(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, model.MigrateModelVendorActiveNames())

	m := &model.Model{ModelName: "delete-recreate-model"}
	require.NoError(t, m.Insert())
	v := &model.Vendor{Name: "delete-recreate-vendor"}
	require.NoError(t, v.Insert())

	modelRecorder := httptest.NewRecorder()
	modelContext, _ := gin.CreateTestContext(modelRecorder)
	modelContext.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", m.Id)}}
	modelContext.Request = httptest.NewRequest(http.MethodDelete, "/api/model/"+fmt.Sprint(m.Id), nil)
	DeleteModelMeta(modelContext)
	assert.Contains(t, modelRecorder.Body.String(), `"success":true`)

	vendorRecorder := httptest.NewRecorder()
	vendorContext, _ := gin.CreateTestContext(vendorRecorder)
	vendorContext.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", v.Id)}}
	vendorContext.Request = httptest.NewRequest(http.MethodDelete, "/api/vendor/"+fmt.Sprint(v.Id), nil)
	DeleteVendorMeta(vendorContext)
	assert.Contains(t, vendorRecorder.Body.String(), `"success":true`)

	var deletedModel model.Model
	var deletedVendor model.Vendor
	require.NoError(t, db.Unscoped().First(&deletedModel, m.Id).Error)
	require.NoError(t, db.Unscoped().First(&deletedVendor, v.Id).Error)
	assert.True(t, deletedModel.DeletedAt.Valid)
	assert.True(t, deletedVendor.DeletedAt.Valid)
	assert.Nil(t, deletedModel.ActiveName)
	assert.Nil(t, deletedVendor.ActiveName)
	require.NoError(t, (&model.Model{ModelName: m.ModelName}).Insert())
	require.NoError(t, (&model.Vendor{Name: v.Name}).Insert())
}

func TestSyncUpstreamModelsReturnsConflictWhenLeaseIsBusy(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.NamedLease{}))
	now := time.Now().Unix()
	ok, err := model.AcquireNamedLease("model-metadata-sync", "other", now, now+60)
	require.NoError(t, err)
	require.True(t, ok)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/models/sync_upstream", nil)
	SyncUpstreamModels(ctx)
	assert.Equal(t, http.StatusConflict, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "正在进行")
}

func TestSyncUpstreamModelsReturnsSafeFetchFailure(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.NamedLease{}))
	require.NoError(t, db.Create(&model.Ability{Model: "missing-upstream", Enabled: true}).Error)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "failed", http.StatusBadGateway)
	}))
	t.Cleanup(server.Close)
	t.Setenv("SYNC_UPSTREAM_BASE", server.URL+"?credential=secret")

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/models/sync_upstream", nil)
	SyncUpstreamModels(ctx)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "获取上游模型失败")
	assert.NotContains(t, recorder.Body.String(), "credential")
}
