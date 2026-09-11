package service

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSessionHintTracksRefreshCookieWithoutExposingCredentials(t *testing.T) {
	for _, secure := range []bool{false, true} {
		for _, clear := range []bool{false, true} {
			previousSecure := common.SessionCookieSecure
			common.SessionCookieSecure = secure
			response := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(response)
			if clear {
				ClearRefreshCookie(context)
			} else {
				WriteRefreshCookie(context, "session.private-refresh-secret")
			}
			common.SessionCookieSecure = previousSecure
			cookies := map[string]*http.Cookie{}
			for _, cookie := range response.Result().Cookies() {
				cookies[cookie.Name] = cookie
			}
			require.Len(t, cookies, 2)
			refresh, hint := cookies[RefreshCookieName], cookies[SessionHintCookieName]
			require.NotNil(t, refresh)
			require.NotNil(t, hint)
			assert.True(t, refresh.HttpOnly)
			assert.False(t, hint.HttpOnly)
			assert.Equal(t, "/", hint.Path)
			assert.Equal(t, secure, hint.Secure)
			assert.Equal(t, refresh.SameSite, hint.SameSite)
			assert.Equal(t, refresh.Expires, hint.Expires)
			assert.Equal(t, refresh.MaxAge, hint.MaxAge)
			if clear {
				assert.Empty(t, hint.Value)
				assert.Equal(t, -1, hint.MaxAge)
			} else {
				assert.Equal(t, "1", hint.Value)
				assert.NotContains(t, hint.String(), "private-refresh-secret")
			}
		}
	}
}
