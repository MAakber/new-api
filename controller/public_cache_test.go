package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPublicNoticeRevalidationTracksContentAcrossEncodings(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{"Notice": "公告 <strong>更新 & \"详情\"</strong>"}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		defer common.OptionMapRWMutex.Unlock()
		common.OptionMap = previous
	})
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.GET("/api/notice", GetNotice)
	initial := httptest.NewRecorder()
	router.ServeHTTP(initial, httptest.NewRequest(http.MethodGet, "/api/notice", nil))
	require.Equal(t, http.StatusOK, initial.Code)
	etag := initial.Header().Get("ETag")
	require.True(t, strings.HasPrefix(etag, `W/"`))
	assert.Equal(t, "no-cache", initial.Header().Get("Cache-Control"))
	assert.Contains(t, initial.Header().Get("Vary"), "Accept-Encoding")
	for _, condition := range []string{etag, strings.TrimPrefix(etag, "W/"), `"other", ` + etag, "*"} {
		request := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
		request.Header.Set("If-None-Match", condition)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusNotModified, response.Code, condition)
		assert.Empty(t, response.Body.Bytes())
	}
	compressedRequest := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
	compressedRequest.Header.Set("Accept-Encoding", "gzip")
	compressed := httptest.NewRecorder()
	router.ServeHTTP(compressed, compressedRequest)
	assert.Equal(t, http.StatusOK, compressed.Code)
	assert.Equal(t, "gzip", compressed.Header().Get("Content-Encoding"))
	assert.Equal(t, etag, compressed.Header().Get("ETag"))
	common.OptionMapRWMutex.Lock()
	common.OptionMap["Notice"] = "公告已更新"
	common.OptionMapRWMutex.Unlock()
	request := httptest.NewRequest(http.MethodGet, "/api/notice", nil)
	request.Header.Set("If-None-Match", etag)
	updated := httptest.NewRecorder()
	router.ServeHTTP(updated, request)
	require.Equal(t, http.StatusOK, updated.Code)
	assert.NotEqual(t, etag, updated.Header().Get("ETag"))
	var response publicContentResponse
	require.NoError(t, common.Unmarshal(updated.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, "公告已更新", response.Data)
}
