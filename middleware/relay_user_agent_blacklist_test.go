package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRelayUserAgentBlacklistMiddleware(t *testing.T) {
	require.NoError(t, i18n.Init())
	gin.SetMode(gin.TestMode)

	tests := []struct {
		name      string
		enabled   bool
		patterns  string
		userAgent string
		want      int
	}{
		{name: "disabled allows matching client", patterns: "blocked", userAgent: "blocked", want: http.StatusOK},
		{name: "empty list allows", enabled: true, userAgent: "blocked", want: http.StatusOK},
		{name: "match rejects", enabled: true, patterns: "^blocked$", userAgent: "blocked", want: http.StatusForbidden},
		{name: "non match allows", enabled: true, patterns: "^blocked$", userAgent: "allowed", want: http.StatusOK},
		{name: "multiple patterns use RE2 case flags", enabled: true, patterns: "^first$\n(?i)^second$", userAgent: "SECOND", want: http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := common.SetRelayUserAgentBlacklistConfig(tt.enabled, tt.patterns)
			require.NoError(t, err)
			router := gin.New()
			router.GET("/relay", RelayUserAgentBlacklist(), func(c *gin.Context) { c.Status(http.StatusOK) })
			request := httptest.NewRequest(http.MethodGet, "/relay", nil)
			request.Header.Set("User-Agent", tt.userAgent)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			require.Equal(t, tt.want, response.Code)
		})
	}
	t.Cleanup(func() { _, _ = common.SetRelayUserAgentBlacklistConfig(false, "") })
}
