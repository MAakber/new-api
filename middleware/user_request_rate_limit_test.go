package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserRequestRateLimitRedisRejectsNPlusOneAndSharesAcrossTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)
	require.NoError(t, i18n.Init())

	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitEnabled = true
	setting.UserRequestRateLimitDefault = 2
	t.Cleanup(func() {
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
	})

	router := gin.New()
	router.GET("/limited", func(c *gin.Context) {
		c.Set("id", 4101)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	first := performUserRequestRateLimitRequest(router, "/limited", "token-a")
	second := performUserRequestRateLimitRequest(router, "/limited", "token-b")
	third := performUserRequestRateLimitRequest(router, "/limited", "token-c")
	assert.Equal(t, http.StatusNoContent, first.Code)
	assert.Equal(t, http.StatusNoContent, second.Code)
	assert.Equal(t, http.StatusTooManyRequests, third.Code)
	assert.Equal(t, "60", third.Header().Get("Retry-After"))
	assert.Contains(t, third.Body.String(), `"code":"user_request_rate_limit_exceeded"`)

	key := redisUserRateLimitKey(UserRequestRateLimitMark, 4101)
	count, err := redisServer.Get(key)
	require.NoError(t, err)
	assert.Equal(t, "3", count)
}

func TestUserRequestRateLimitRedisIsolatesUsers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)
	require.NoError(t, i18n.Init())

	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitEnabled = true
	setting.UserRequestRateLimitDefault = 1
	t.Cleanup(func() {
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
	})

	router := gin.New()
	registerUserRequestRateLimitTestRoute := func(path string, userID int) {
		router.GET(path, func(c *gin.Context) {
			c.Set("id", userID)
		}, UserRequestRateLimit(), func(c *gin.Context) {
			c.Status(http.StatusNoContent)
		})
	}
	registerUserRequestRateLimitTestRoute("/user-one", 4102)
	registerUserRequestRateLimitTestRoute("/user-two", 4103)

	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/user-one", "shared-token").Code)
	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/user-two", "shared-token").Code)
	assert.Equal(t, http.StatusTooManyRequests, performUserRequestRateLimitRequest(router, "/user-one", "another-token").Code)
	assert.Equal(t, http.StatusTooManyRequests, performUserRequestRateLimitRequest(router, "/user-two", "another-token").Code)

	assert.True(t, redisServer.Exists(redisUserRateLimitKey(UserRequestRateLimitMark, 4102)))
	assert.True(t, redisServer.Exists(redisUserRateLimitKey(UserRequestRateLimitMark, 4103)))
}

func TestUserRequestRateLimitNilDefaultAndZeroSemantics(t *testing.T) {
	gin.SetMode(gin.TestMode)
	redisServer, _ := useRateLimitMiniRedis(t)
	require.NoError(t, i18n.Init())

	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitEnabled = true
	setting.UserRequestRateLimitDefault = 1
	t.Cleanup(func() {
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
	})

	var nilLimit *int
	zeroLimit := 0
	router := gin.New()
	router.GET("/default", func(c *gin.Context) {
		c.Set("id", 4104)
		c.Set("requests_per_minute", nilLimit)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.GET("/unlimited", func(c *gin.Context) {
		c.Set("id", 4105)
		c.Set("requests_per_minute", &zeroLimit)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	router.GET("/disabled", func(c *gin.Context) {
		c.Set("id", 4108)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/default", "token").Code)
	assert.Equal(t, http.StatusTooManyRequests, performUserRequestRateLimitRequest(router, "/default", "token").Code)
	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/unlimited", "token").Code)
	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/unlimited", "token").Code)
	assert.False(t, redisServer.Exists(redisUserRateLimitKey(UserRequestRateLimitMark, 4105)))

	setting.UserRequestRateLimitEnabled = false
	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/disabled", "token").Code)
	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/disabled", "token").Code)
	assert.False(t, redisServer.Exists(redisUserRateLimitKey(UserRequestRateLimitMark, 4108)))
}

func TestUserRequestRateLimitRedisFailureReturnsServiceUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	_, redisClient := useRateLimitMiniRedis(t)
	require.NoError(t, redisClient.Close())
	require.NoError(t, i18n.Init())

	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitEnabled = true
	setting.UserRequestRateLimitDefault = 1
	t.Cleanup(func() {
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
	})

	router := gin.New()
	router.GET("/limited", func(c *gin.Context) {
		c.Set("id", 4106)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	response := performUserRequestRateLimitRequest(router, "/limited", "token")
	assert.Equal(t, http.StatusServiceUnavailable, response.Code)
	assert.NotContains(t, response.Body.String(), `"code":"user_request_rate_limit_exceeded"`)
	assert.Contains(t, response.Body.String(), `"code":"user_request_rate_limit_unavailable"`)
}

func TestUserRequestRateLimitMemoryFallbackIsProcessLocal(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousRedisEnabled := common.RedisEnabled
	previousRedisClient := common.RDB
	common.RedisEnabled = false
	common.RDB = nil
	t.Cleanup(func() {
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRedisClient
	})

	previousEnabled := setting.UserRequestRateLimitEnabled
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitEnabled = true
	setting.UserRequestRateLimitDefault = 1
	t.Cleanup(func() {
		setting.UserRequestRateLimitEnabled = previousEnabled
		setting.UserRequestRateLimitDefault = previousDefault
	})

	router := gin.New()
	router.GET("/limited", func(c *gin.Context) {
		c.Set("id", 4107)
	}, UserRequestRateLimit(), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})

	assert.Equal(t, http.StatusNoContent, performUserRequestRateLimitRequest(router, "/limited", "token").Code)
	limited := performUserRequestRateLimitRequest(router, "/limited", "token")
	assert.Equal(t, http.StatusTooManyRequests, limited.Code)
	assert.Equal(t, "60", limited.Header().Get("Retry-After"))
}

func performUserRequestRateLimitRequest(router http.Handler, path string, token string) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	router.ServeHTTP(recorder, request)
	return recorder
}
