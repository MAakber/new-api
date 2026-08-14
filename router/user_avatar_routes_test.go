package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminUserAvatarRouteIsProtectedAndKeepsSelfRoute(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	var adminAvatarRoute *gin.RouteInfo
	var selfAvatarRoute *gin.RouteInfo
	for _, route := range engine.Routes() {
		if route.Method != http.MethodGet {
			continue
		}
		switch route.Path {
		case "/api/user/:id/avatar":
			routeCopy := route
			adminAvatarRoute = &routeCopy
		case "/api/user/self/avatar":
			routeCopy := route
			selfAvatarRoute = &routeCopy
		}
	}

	require.NotNil(t, adminAvatarRoute)
	require.NotNil(t, selfAvatarRoute)
	assert.Contains(t, adminAvatarRoute.Handler, "GetAdminUserAvatar")

	request := httptest.NewRequest(http.MethodGet, "/api/user/123/avatar", nil)
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	assert.Equal(t, http.StatusUnauthorized, recorder.Code)
}
