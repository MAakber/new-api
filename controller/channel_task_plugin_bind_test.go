package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupTaskPluginBindChannelTest(t *testing.T) {
	t.Helper()
	wasMaster := common.IsMasterNode
	common.IsMasterNode = true
	previousRedisEnabled := common.RedisEnabled
	common.RedisEnabled = false
	originalDB, originalLogDB := model.DB, model.LOG_DB
	database, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := database.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, database.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.Option{}, &model.CasbinRule{}, &model.AuthzRole{}, &model.Log{}, &model.AuditLog{}, &model.User{}))
	model.DB = database
	model.LOG_DB = database
	require.NoError(t, authz.Init(database))
	t.Cleanup(func() {
		common.IsMasterNode = wasMaster
		common.RedisEnabled = previousRedisEnabled
		model.DB = originalDB
		model.LOG_DB = originalLogDB
	})
}

func postAddChannel(t *testing.T, userID, role int, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Set("id", userID)
	context.Set("role", role)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/channel", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	AddChannel(context)
	return recorder
}

func TestAddChannelTaskPluginRequiresBindPermission(t *testing.T) {
	setupTaskPluginBindChannelTest(t)
	const key = "channel-bind"
	source := `
export const meta = {apiVersion: 1, key: "channel-bind", name: "Bind", version: "1.0.0", author: {name: "Test"}, models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`
	_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister(key) })

	taskPluginBody := fmt.Sprintf(`{"mode":"single","channel":{"type":%d,"name":"plugin-channel","key":"sk","models":"doc","group":"default","base_url":"https://example.com","setting":"{\"task_plugin_key\":\"channel-bind\"}"}}`, constant.ChannelTypeTaskPlugin)
	openaiBody := `{"mode":"single","channel":{"type":1,"name":"openai-channel","key":"sk","models":"gpt","group":"default"}}`

	adminDenied := postAddChannel(t, 2, common.RoleAdminUser, taskPluginBody)
	assert.Contains(t, adminDenied.Body.String(), "task plugin channels require the task_plugin.bind permission")
	assert.Contains(t, adminDenied.Body.String(), `"success":false`)

	rootAllowed := postAddChannel(t, 1, common.RoleRootUser, taskPluginBody)
	assert.Contains(t, rootAllowed.Body.String(), `"success":true`)
	assert.NotContains(t, rootAllowed.Body.String(), "task_plugin.bind")

	adminOtherType := postAddChannel(t, 2, common.RoleAdminUser, openaiBody)
	assert.Contains(t, adminOtherType.Body.String(), `"success":true`)
	assert.NotContains(t, adminOtherType.Body.String(), "task_plugin.bind")
}

func TestUpdateChannelTaskPluginRequiresBindPermission(t *testing.T) {
	setupTaskPluginBindChannelTest(t)
	const key = "channel-bind-update"
	source := `
export const meta = {apiVersion: 1, key: "channel-bind-update", name: "Bind", version: "1.0.0", author: {name: "Test"}, models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`
	_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister(key) })

	baseURL := "https://example.com"
	setting := `{"task_plugin_key":"channel-bind-update"}`
	channel := model.Channel{
		Type:    constant.ChannelTypeTaskPlugin,
		Status:  common.ChannelStatusEnabled,
		Name:    "existing-plugin",
		Models:  "doc",
		Group:   "default",
		Key:     "sk",
		BaseURL: &baseURL,
		Setting: &setting,
	}
	require.NoError(t, channel.Insert())

	payload := fmt.Sprintf(
		`{"id":%d,"type":%d,"name":"existing-plugin","key":"sk","models":"doc","group":"default","base_url":"https://example.com","setting":"{\"task_plugin_key\":\"channel-bind-update\"}"}`,
		channel.Id, constant.ChannelTypeTaskPlugin,
	)
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Set("id", 2)
	context.Set("role", common.RoleAdminUser)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/channel", strings.NewReader(payload))
	context.Request.Header.Set("Content-Type", "application/json")
	UpdateChannel(context)
	assert.Contains(t, recorder.Body.String(), "task plugin channels require the task_plugin.bind permission")
	assert.Contains(t, recorder.Body.String(), `"success":false`)
}

func TestAddChannelTaskPluginPersistsPluginDefaultBaseURLAndAuditsSource(t *testing.T) {
	setupTaskPluginBindChannelTest(t)
	for key, baseURLField := range map[string]string{"bind-default-url": `baseUrl: "http://10.0.0.5:8000/",`, "bind-no-default": ""} {
		source := fmt.Sprintf(`
export const meta = {apiVersion: 1, key: %q, name: "Bind", version: "1.0.0", author: {name: "Test"}, %s models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`, key, baseURLField)
		_, err := jsplugin.DefaultRegistry.Register(source, jsplugin.Options{})
		require.NoError(t, err)
		t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister(key) })
	}
	body := func(pluginKey string) string {
		return fmt.Sprintf(`{"mode":"single","channel":{"type":%d,"name":"%s","key":"sk","models":"doc","group":"default","setting":"{\"task_plugin_key\":\"%s\"}"}}`, constant.ChannelTypeTaskPlugin, pluginKey, pluginKey)
	}

	noDefault := postAddChannel(t, 1, common.RoleRootUser, body("bind-no-default"))
	assert.Contains(t, noDefault.Body.String(), "base URL is required for task plugin channels")

	filled := postAddChannel(t, 1, common.RoleRootUser, body("bind-default-url"))
	require.Contains(t, filled.Body.String(), `"success":true`)
	var created model.Channel
	require.NoError(t, model.DB.Where("name = ?", "bind-default-url").First(&created).Error)
	require.NotNil(t, created.BaseURL)
	assert.Equal(t, "http://10.0.0.5:8000", *created.BaseURL, "the normalized plugin default is stored on the channel row")

	var audits []model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action = ?", "channel.create").Find(&audits).Error)
	encoded, err := common.Marshal(audits)
	require.NoError(t, err)
	assert.Contains(t, string(encoded), `"base_url_source":"plugin_default"`)
}

func TestUpdateChannelPluginDefaultParticipatesInSparsePatchAndAuthorization(t *testing.T) {
	for _, tc := range []struct {
		name    string
		userID  int
		role    int
		allowed bool
	}{
		{name: "root persists default and preserves credentials", userID: 1, role: common.RoleRootUser, allowed: true},
		{name: "binding alone cannot change the endpoint", userID: 2, role: common.RoleAdminUser},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setupTaskPluginBindChannelTest(t)
			const key = "sparse-plugin-default"
			_, err := jsplugin.DefaultRegistry.Register(`
export const meta = {apiVersion: 1, key: "sparse-plugin-default", name: "Sparse", version: "1.0.0", author: {name: "Test"}, baseUrl: "https://example.com/", models: ["doc"], fetchMode: "per_task"};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`, jsplugin.Options{})
			require.NoError(t, err)
			t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister(key) })
			require.NoError(t, authz.SetUserPermissions(2, authz.PermissionsMap{
				authz.ResourceTaskPlugin: {authz.ActionBind: true},
			}))
			channel := model.Channel{
				Type: constant.ChannelTypeTaskPlugin, Status: common.ChannelStatusEnabled,
				Name: "before", Key: "retained-secret", Models: "doc", Group: "default",
				Setting: common.GetPointer(`{"task_plugin_key":"sparse-plugin-default"}`),
			}
			require.NoError(t, channel.Insert())
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Set("id", tc.userID)
			context.Set("role", tc.role)
			context.Request = httptest.NewRequest(http.MethodPut, "/api/channel", strings.NewReader(fmt.Sprintf(`{"id":%d,"name":"after"}`, channel.Id)))
			context.Request.Header.Set("Content-Type", "application/json")
			UpdateChannel(context)

			var response struct {
				Success bool          `json:"success"`
				Data    model.Channel `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.Equal(t, tc.allowed, response.Success, recorder.Body.String())
			stored, err := model.GetChannelById(channel.Id, true)
			require.NoError(t, err)
			assert.Equal(t, "retained-secret", stored.Key)
			assert.Equal(t, "doc", stored.Models)
			if tc.allowed {
				assert.Equal(t, "after", stored.Name)
				assert.Equal(t, "https://example.com", stored.GetBaseURL())
				assert.Equal(t, stored.BaseURL, response.Data.BaseURL)
				assert.Empty(t, response.Data.Key)
				var audit model.AuditLog
				require.NoError(t, model.LOG_DB.Where("action = ?", "channel.update").First(&audit).Error)
				encoded, err := common.Marshal(audit)
				require.NoError(t, err)
				assert.Contains(t, string(encoded), `"base_url_source":"plugin_default"`)
			} else {
				assert.Equal(t, "before", stored.Name)
				assert.Empty(t, stored.GetBaseURL())
			}
		})
	}
}
