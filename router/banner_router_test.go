package router

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestBannerRoutesUseTheIndependentPublicAndAdminEndpoints(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetApiRouter(engine)

	routes := make(map[string]struct{}, len(engine.Routes()))
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = struct{}{}
	}
	for _, route := range []string{
		http.MethodGet + " /api/banners",
		http.MethodGet + " /api/banner",
		http.MethodPost + " /api/banner",
		http.MethodPut + " /api/banner/:id",
		http.MethodDelete + " /api/banner/:id",
	} {
		_, found := routes[route]
		assert.True(t, found, route)
	}
}
