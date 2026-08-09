package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestUserRequestRateLimitSubmissionRouteCoverage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetRelayRouter(engine)
	SetVideoRouter(engine)

	for _, route := range []struct {
		method string
		path   string
	}{
		{http.MethodPost, "/v1/chat/completions"},
		{http.MethodGet, "/v1/realtime"},
		{http.MethodPost, "/v1beta/models/*path"},
		{http.MethodPost, "/pg/chat/completions"},
		{http.MethodPost, "/suno/submit/:action"},
		{http.MethodPost, "/mj/submit/imagine"},
		{http.MethodPost, "/mj/insight-face/swap"},
		{http.MethodPost, "/:mode/mj/submit/imagine"},
		{http.MethodPost, "/:mode/mj/insight-face/swap"},
		{http.MethodPost, "/v1/video/generations"},
		{http.MethodPost, "/v1/videos"},
		{http.MethodPost, "/v1/videos/:video_id/remix"},
		{http.MethodPost, "/kling/v1/videos/text2video"},
		{http.MethodPost, "/jimeng/"},
	} {
		routeInfo := findRoute(engine, route.method, route.path)
		require.NotNilf(t, routeInfo, "missing route %s %s", route.method, route.path)
	}

	for _, route := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/v1/models"},
		{http.MethodGet, "/v1/models/:model"},
		{http.MethodGet, "/v1beta/models"},
		{http.MethodGet, "/v1beta/openai/models"},
		{http.MethodPost, "/suno/fetch"},
		{http.MethodGet, "/suno/fetch/:id"},
		{http.MethodGet, "/mj/task/:id/fetch"},
		{http.MethodPost, "/mj/task/list-by-condition"},
		{http.MethodGet, "/v1/video/generations/:task_id"},
		{http.MethodGet, "/v1/videos/:task_id"},
		{http.MethodGet, "/v1/videos/:task_id/content"},
		{http.MethodGet, "/v1/files/:id/content"},
		{http.MethodGet, "/kling/v1/videos/text2video/:task_id"},
	} {
		routeInfo := findRoute(engine, route.method, route.path)
		require.NotNilf(t, routeInfo, "missing route %s %s", route.method, route.path)
	}
}

func findRoute(engine *gin.Engine, method string, path string) *gin.RouteInfo {
	for _, route := range engine.Routes() {
		if route.Method == method && route.Path == path {
			return &route
		}
	}
	return nil
}
