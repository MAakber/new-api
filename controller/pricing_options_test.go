package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePricingControllerDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Log{}))
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousOptions := common.OptionMap
	previousRedisEnabled := common.RedisEnabled
	model.DB, model.LOG_DB = db, db
	common.OptionMap = map[string]string{}
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB, model.LOG_DB, common.OptionMap, common.RedisEnabled = previousDB, previousLogDB, previousOptions, previousRedisEnabled
	})
	require.NoError(t, model.SeedCanonicalPricingOptions())
	return db
}

func performPricingPatch(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPatch, "/api/option/pricing/patch", bytes.NewBufferString(body))
	context.Set("id", 1)
	PatchPricingOptions(context)
	return recorder
}

func TestPricingPatchHandlerSuccessConflictAndBadInput(t *testing.T) {
	db := usePricingControllerDB(t)
	success := performPricingPatch(t, `{"operations":[{"key":"ModelPrice","model":"audit-secret-model","action":"set","value":0,"expected":{"present":false}}]}`)
	require.Equal(t, http.StatusOK, success.Code)
	var response struct {
		Success bool              `json:"success"`
		Data    map[string]string `json:"data"`
	}
	require.NoError(t, json.Unmarshal(success.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data, len(model.PricingOptionKeys))

	conflict := performPricingPatch(t, `{"operations":[{"key":"ModelPrice","model":"audit-secret-model","action":"set","value":1,"expected":{"present":false}}]}`)
	require.Equal(t, http.StatusConflict, conflict.Code)
	bad := performPricingPatch(t, `{"operations":[{"key":"ModelPrice","model":"x","action":"set","value":"not-a-price","expected":{"present":false}}]}`)
	require.Equal(t, http.StatusBadRequest, bad.Code)

	var logs []model.Log
	require.NoError(t, db.Find(&logs).Error)
	require.Len(t, logs, 1)
	require.NotContains(t, logs[0].Other, "audit-secret-model")
	require.NotContains(t, logs[0].Other, `"value"`)
}

func TestResetModelRatioUsesPricingPatchPath(t *testing.T) {
	db := usePricingControllerDB(t)
	require.NoError(t, db.Model(&model.Option{}).Where("key = ?", "ModelRatio").Update("value", `{"custom-model":2}`).Error)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	ResetModelRatio(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var stored model.Option
	require.NoError(t, db.Where("key = ?", "ModelRatio").First(&stored).Error)
	require.JSONEq(t, ratio_setting.DefaultModelRatio2JSONString(), stored.Value)
	common.OptionMapRWMutex.RLock()
	require.JSONEq(t, stored.Value, common.OptionMap["ModelRatio"])
	common.OptionMapRWMutex.RUnlock()
}

func TestGenericOptionHandlerRejectsPricingBeforeRuntimeValidation(t *testing.T) {
	db := usePricingControllerDB(t)
	var before model.Option
	require.NoError(t, db.Where("key = ?", "ModelPrice").First(&before).Error)
	common.OptionMapRWMutex.Lock()
	common.OptionMap["ModelPrice"] = before.Value
	common.OptionMapRWMutex.Unlock()
	runtimeBefore := ratio_setting.ModelPrice2JSONString()

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/option/", bytes.NewBufferString(`{"key":"ModelPrice","value":{"must_not_publish":1}}`))
	UpdateOption(context)
	require.Equal(t, http.StatusBadRequest, recorder.Code)
	var after model.Option
	require.NoError(t, db.Where("key = ?", "ModelPrice").First(&after).Error)
	require.Equal(t, before.Value, after.Value)
	common.OptionMapRWMutex.RLock()
	require.Equal(t, before.Value, common.OptionMap["ModelPrice"])
	common.OptionMapRWMutex.RUnlock()
	require.Equal(t, runtimeBefore, ratio_setting.ModelPrice2JSONString())
}
