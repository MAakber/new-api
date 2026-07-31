package model

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRequestDebugRedactsHeadersAndQuery(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "http://example.test/v1?key=api-key&token=secret&safe=value&x_signature=sig", strings.NewReader("body-must-not-appear"))
	req.Header.Set("Authorization", "Bearer secret")
	req.Header.Set("X-API-Key", "api-key")
	req.Header.Set("X-Trace", "visible")

	debug := common.RequestDebugInbound(req)
	encoded, err := json.Marshal(debug)
	require.NoError(t, err)
	require.True(t, json.Valid(encoded))
	require.Contains(t, debug["url"], "token=%5BREDACTED%5D")
	require.Contains(t, debug["url"], "key=%5BREDACTED%5D")
	require.NotContains(t, debug["url"], "secret")
	require.NotContains(t, debug["url"], "api-key")
	headers := debug["headers"].(map[string]interface{})
	require.Equal(t, "[REDACTED]", headers["Authorization"])
	require.Equal(t, "[REDACTED]", headers["X-Api-Key"])
	require.Equal(t, "visible", headers["X-Trace"])
	require.NotContains(t, string(encoded), "body-must-not-appear")
}

func TestRequestDebugLimitProducesValidJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://example.test", nil)
	for i := 0; i < 80; i++ {
		req.Header.Set("X-Long-"+string(rune('A'+i%26))+string(rune('a'+i/26)), strings.Repeat("x", 1024))
	}
	debug := common.RequestDebugInbound(req)
	encoded, err := json.Marshal(debug)
	require.NoError(t, err)
	require.LessOrEqual(t, len(encoded), 4*1024)
	require.True(t, debug["truncated"].(bool))
}

func TestRecordLogsUseClientIPAndNeverStoreBody(t *testing.T) {
	previousLogDB := LOG_DB
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	LOG_DB = db
	t.Cleanup(func() { LOG_DB = previousLogDB })
	require.NoError(t, db.AutoMigrate(&Log{}))

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "http://example.test/relay?password=secret", strings.NewReader("never-store-this-body"))
	c.Request.RemoteAddr = "198.51.100.7:1234"
	c.Set("username", "test-user")

	RecordConsumeLog(c, 1, RecordConsumeLogParams{Content: "consume", Other: map[string]interface{}{}})
	RecordErrorLog(c, 1, 0, "model", "token", "error", 0, 0, false, "default", map[string]interface{}{})

	var logs []Log
	require.NoError(t, db.Order("type").Find(&logs).Error)
	require.Len(t, logs, 2)
	for _, log := range logs {
		require.Equal(t, "198.51.100.7", log.Ip)
		require.NotContains(t, log.Other, "never-store-this-body")
		parsed, parseErr := common.StrToMap(log.Other)
		require.NoError(t, parseErr)
		adminInfo := parsed["admin_info"].(map[string]interface{})
		requestDebug := adminInfo["request_debug"].(map[string]interface{})
		inbound := requestDebug["inbound"].(map[string]interface{})
		require.NotContains(t, inbound, "body")
		require.NotContains(t, inbound["url"], "secret")
	}
}
