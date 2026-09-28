package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func usePricingControllerDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.Log{}, &model.AuditLog{}))
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
	context.Set("role", common.RoleRootUser)
	context.Set("username", "root")
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
	require.NoError(t, common.Unmarshal(success.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.Len(t, response.Data, len(model.PricingOptionKeys))

	conflict := performPricingPatch(t, `{"operations":[{"key":"ModelPrice","model":"audit-secret-model","action":"set","value":1,"expected":{"present":false}}]}`)
	require.Equal(t, http.StatusConflict, conflict.Code)
	bad := performPricingPatch(t, `{"operations":[{"key":"ModelPrice","model":"x","action":"set","value":"not-a-price","expected":{"present":false}}]}`)
	require.Equal(t, http.StatusBadRequest, bad.Code)

	var logs []model.AuditLog
	require.NoError(t, db.Find(&logs).Error)
	require.Len(t, logs, 1)
	assert.Equal(t, model.AuditCategoryOperation, logs[0].Category)
	assert.Equal(t, "option.pricing_patch", logs[0].Action)
	metadata, err := common.Marshal(logs[0].Other)
	require.NoError(t, err)
	assert.NotContains(t, string(metadata), "audit-secret-model")
	assert.NotContains(t, string(metadata), `"value"`)
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

func TestPricingPatchPluginVariantsUseLockedSnapshot(t *testing.T) {
	previousConfig := config.GlobalConfig.ExportAllConfigs()
	t.Cleanup(func() { require.NoError(t, config.GlobalConfig.LoadFromDB(previousConfig)) })
	usePricingControllerDB(t)
	for _, spec := range []struct{ key, field string }{{"patch-alpha", "seconds"}, {"patch-beta", "credits"}} {
		source := fmt.Sprintf(`
export const meta={apiVersion:1,key:%q,name:%q,version:"1.0.0",author:{name:"Test"},models:["patch-shared"],fetchMode:"per_task",usageSchema:{%s:{type:"number",unit:"count"}}};
export function buildSubmitRequest(){return {}} export function parseSubmitResponse(){return {}}
export function buildQueryRequest(){return {}} export function parseTaskResult(){return {}}
`, spec.key, spec.key, spec.field)
		_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
		require.NoError(t, err)
		t.Cleanup(func() { require.NoError(t, jsplugin.DefaultRegistry.Unregister(spec.key)) })
	}
	created := performPricingPatch(t, `{"operations":[
{"key":"billing_setting.billing_expr","model":"patch-shared","action":"set","value":"u(\"seconds\")","expected":{"present":false}},
{"key":"billing_setting.plugin_billing_expr","model":"patch-beta::patch-shared","action":"set","value":"u(\"credits\")","expected":{"present":false}}
]}`)
	require.Equal(t, http.StatusOK, created.Code, created.Body.String())
	expression, exists := billing_setting.GetPluginBillingExpr("patch-beta", "patch-shared")
	require.True(t, exists)
	require.Equal(t, `u("credits")`, expression)
	deleted := performPricingPatch(t, `{"operations":[{"key":"billing_setting.plugin_billing_expr","model":"patch-beta::patch-shared","action":"delete","expected":{"present":true,"value":"u(\"credits\")"}}]}`)
	require.Equal(t, http.StatusBadRequest, deleted.Code, deleted.Body.String())
	stillStored, exists := billing_setting.GetPluginBillingExpr("patch-beta", "patch-shared")
	require.True(t, exists)
	assert.Equal(t, expression, stillStored)
	require.NoError(t, jsplugin.DefaultRegistry.Unregister("patch-beta"))
	// An out-of-date process cache must neither reject the stored orphan nor
	// authorize a different orphaned expression absent from the locked database.
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		billing_setting.PluginBillingExprOption: `{"patch-beta::patch-shared":"u(\"credits\") * 2"}`,
	}))
	ordinary := performPricingPatch(t, `{"operations":[{"key":"ModelRatio","model":"patch-shared","action":"set","value":2,"expected":{"present":false}}]}`)
	require.Equal(t, http.StatusOK, ordinary.Code, ordinary.Body.String())
	invalidOrphan := performPricingPatch(t, `{"operations":[{"key":"billing_setting.plugin_billing_expr","model":"patch-beta::patch-shared","action":"set","value":"u(\"credits\") * 2","expected":{"present":true,"value":"u(\"credits\")"}}]}`)
	require.Equal(t, http.StatusBadRequest, invalidOrphan.Code, invalidOrphan.Body.String())
	removed := performPricingPatch(t, `{"operations":[{"key":"billing_setting.plugin_billing_expr","model":"patch-beta::patch-shared","action":"delete","expected":{"present":true,"value":"u(\"credits\")"}}]}`)
	require.Equal(t, http.StatusOK, removed.Code, removed.Body.String())
	_, exists = billing_setting.GetPluginBillingExpr("patch-beta", "patch-shared")
	assert.False(t, exists)
}
