package middleware

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

const (
	// UserRequestRateLimitMark is intentionally separate from model request
	// limiting so both limits can be enforced for the same request.
	UserRequestRateLimitMark     = "URPM"
	UserRequestRateLimitDuration = int64(60)

	userRequestRateLimitExceededCode    types.ErrorCode = "user_request_rate_limit_exceeded"
	userRequestRateLimitUnavailableCode types.ErrorCode = "user_request_rate_limit_unavailable"
)

// UserRequestRateLimit limits authenticated users to their configured number
// of requests per minute. The middleware must run after authentication so the
// counter is keyed by the user ID rather than by a token or client IP.
func UserRequestRateLimit() gin.HandlerFunc {
	return userRequestRateLimitMiddleware(false)
}

// UserRequestRateLimitSubmit is used by adapters whose task-submit route can
// rewrite a request into a GET task lookup (for example Jimeng). Such lookup
// requests must not consume the submit allowance.
func UserRequestRateLimitSubmit() gin.HandlerFunc {
	return userRequestRateLimitMiddleware(true)
}

func userRequestRateLimitMiddleware(skipGet bool) gin.HandlerFunc {
	// Keep the process-local fallback initialized before requests arrive. The
	// fallback is deliberately process-local and is not a distributed limit.
	inMemoryRateLimiter.Init(common.RateLimitKeyExpirationDuration)

	return func(c *gin.Context) {
		if !setting.UserRequestRateLimitEnabled || (skipGet && c.Request.Method == http.MethodGet) {
			c.Next()
			return
		}

		userID := c.GetInt("id")
		if userID <= 0 {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}

		maxRequestNum := userRequestRateLimitForContext(c)
		if maxRequestNum <= 0 {
			c.Next()
			return
		}

		key := redisUserRateLimitKey(UserRequestRateLimitMark, userID)
		if common.RedisEnabled {
			allowed, _, ttlSeconds, err := redisFixedWindowTake(
				c.Request.Context(),
				key,
				maxRequestNum,
				UserRequestRateLimitDuration,
			)
			if err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("user request rate limit check failed (user=%d): %v", userID, err))
				abortWithOpenAiMessage(
					c,
					http.StatusServiceUnavailable,
					i18n.T(c, i18n.MsgUserRequestRateLimitUnavailable),
					userRequestRateLimitUnavailableCode,
				)
				return
			}
			if !allowed {
				abortUserRequestRateLimited(c, maxRequestNum, ttlSeconds)
				return
			}
			c.Next()
			return
		}

		if !inMemoryRateLimiter.Request(key, maxRequestNum, UserRequestRateLimitDuration) {
			abortUserRequestRateLimited(c, maxRequestNum, UserRequestRateLimitDuration)
			return
		}
		c.Next()
	}
}

// userRequestRateLimitForContext deliberately reads the raw Gin value. Gin's
// GetInt helper cannot distinguish a nil *int (inherit the default) from an
// explicit zero (unlimited).
func userRequestRateLimitForContext(c *gin.Context) int {
	value, ok := c.Get("requests_per_minute")
	if !ok || value == nil {
		return boundedUserRequestRateLimit(setting.UserRequestRateLimitDefault)
	}

	switch typed := value.(type) {
	case *int:
		if typed == nil {
			return boundedUserRequestRateLimit(setting.UserRequestRateLimitDefault)
		}
		return boundedUserRequestRateLimit(*typed)
	case int:
		return boundedUserRequestRateLimit(typed)
	default:
		return boundedUserRequestRateLimit(setting.UserRequestRateLimitDefault)
	}
}

func boundedUserRequestRateLimit(value int) int {
	if value > setting.MaxUserRequestsPerMinute {
		return setting.MaxUserRequestsPerMinute
	}
	return value
}

func abortUserRequestRateLimited(c *gin.Context, maxRequestNum int, retryAfterSeconds int64) {
	if retryAfterSeconds < 1 {
		retryAfterSeconds = 1
	}
	c.Header("Retry-After", strconv.FormatInt(retryAfterSeconds, 10))
	abortWithOpenAiMessage(
		c,
		http.StatusTooManyRequests,
		i18n.T(c, i18n.MsgUserRequestRateLimitReached, map[string]any{
			"Max":     maxRequestNum,
			"Minutes": 1,
		}),
		userRequestRateLimitExceededCode,
	)
}
