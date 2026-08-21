package router

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChannelStatusRoutesUseOperatePermission(t *testing.T) {
	assertChannelRoutePermission(t, http.MethodGet, "/:id/custom-balance", authz.ChannelRead, controller.GetChannelCustomBalance)
	assertChannelRoutePermission(t, http.MethodPut, "/:id/custom-balance", authz.ChannelSensitiveWrite, controller.UpdateChannelCustomBalance)
	assertChannelRoutePermission(t, http.MethodPost, "/:id/custom-balance/refresh", authz.ChannelOperate, controller.RefreshChannelCustomBalance)
	assertChannelRoutePermission(t, http.MethodPost, "/:id/custom-balance/checkin", authz.ChannelOperate, controller.CheckinChannelCustomBalance)
	assertChannelRoutePermission(t, http.MethodPost, "/:id/status", authz.ChannelOperate, controller.UpdateChannelStatus)
	assertChannelRoutePermission(t, http.MethodPost, "/status/batch", authz.ChannelOperate, controller.BatchUpdateChannelStatus)
	assertChannelRoutePermission(t, http.MethodPut, "/", authz.ChannelWrite, controller.UpdateChannel)
}

func TestDetailedChannelTestRouteUsesOperatePermission(t *testing.T) {
	assertChannelRoutePermission(t, http.MethodPost, "/test/:id", authz.ChannelOperate, controller.TestChannelDetailed)
}

// The header profile npm version routes replaced the removed client identity
// version endpoints.
func TestChannelNpmVersionOptionRoutesUseChannelPermissions(t *testing.T) {
	assertChannelRoutePermission(t, http.MethodGet, "/npm_version_options", authz.ChannelRead, controller.GetChannelNpmVersionOptions)
	assertChannelRoutePermission(t, http.MethodGet, "/npm_version_options/diagnostics", authz.ChannelRead, controller.GetChannelNpmVersionDiagnostics)
	assertChannelRoutePermission(t, http.MethodPost, "/npm_version_options/refresh", authz.ChannelOperate, controller.RefreshChannelNpmVersionOptions)
}

func TestChannelDeleteRoutesUseSensitiveWritePermission(t *testing.T) {
	assertChannelRoutePermission(t, http.MethodDelete, "/:id", authz.ChannelSensitiveWrite, controller.DeleteChannel)
	assertChannelRoutePermission(t, http.MethodPost, "/batch", authz.ChannelSensitiveWrite, controller.DeleteChannelBatch)
	assertChannelRoutePermission(t, http.MethodDelete, "/disabled", authz.ChannelSensitiveWrite, controller.DeleteDisabledChannel)
	assertChannelRoutePermission(t, http.MethodPut, "/", authz.ChannelWrite, controller.UpdateChannel)
	assertChannelRoutePermission(t, http.MethodPut, "/tag", authz.ChannelWrite, controller.EditTagChannels)
	assertChannelRoutePermission(t, http.MethodPost, "/batch/tag", authz.ChannelWrite, controller.BatchSetChannelTag)
}

func TestChannelStatusRoutesRegisterWithoutConflict(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	api := engine.Group("/api")

	require.NotPanics(t, func() {
		registerChannelRoutes(api)
	})
}

func assertChannelRoutePermission(t *testing.T, method string, path string, permission authz.Permission, handler any) {
	t.Helper()
	for _, route := range channelPermissionRoutes {
		if route.method == method && route.path == path {
			assert.Equal(t, permission, route.permission)
			assert.Equal(t, reflect.ValueOf(handler).Pointer(), reflect.ValueOf(route.handler).Pointer())
			return
		}
	}
	t.Fatalf("route %s %s not found", method, path)
}
