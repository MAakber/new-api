package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRelayRoutesAuthenticateBeforeUserAgentRestriction(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)
	_, err := common.SetRelayUserAgentBlacklistConfig(true, "^blocked-client$")
	require.NoError(t, err)
	t.Cleanup(func() { _, _ = common.SetRelayUserAgentBlacklistConfig(false, "") })
	router := gin.New()
	SetRelayRouter(router)
	SetVideoRouter(router)
	for _, route := range []struct {
		method string
		path   string
		want   int
	}{
		{http.MethodGet, "/v1/models", http.StatusUnauthorized},
		{http.MethodPost, "/v1/chat/completions", http.StatusUnauthorized},
		{http.MethodGet, "/v1beta/models", http.StatusUnauthorized},
		{http.MethodGet, "/v1beta/openai/models", http.StatusUnauthorized},
		{http.MethodPost, "/v1beta/models/gemini:generateContent", http.StatusUnauthorized},
		{http.MethodPost, "/mj/submit/imagine", http.StatusUnauthorized},
		{http.MethodPost, "/fast/mj/submit/imagine", http.StatusUnauthorized},
		{http.MethodPost, "/suno/submit/generate", http.StatusUnauthorized},
		{http.MethodPost, "/v1/video/generations", http.StatusUnauthorized},
		{http.MethodPost, "/kling/v1/videos/text2video", http.StatusUnauthorized},
		{http.MethodPost, "/jimeng/", http.StatusBadRequest},
	} {
		request := httptest.NewRequest(route.method, route.path, nil)
		request.Header.Set("User-Agent", "blocked-client")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		require.Equalf(t, route.want, response.Code, "%s %s", route.method, route.path)
	}
}
