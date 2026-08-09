package model

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserRequestRateLimitCacheAndContextPreserveNilAndZero(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)

	zero := 0
	user := User{
		Username:          "request-rate-cache-user",
		Password:          "password",
		Role:              common.RoleCommonUser,
		Status:            common.UserStatusEnabled,
		Group:             "default",
		AuthVersion:       1,
		RequestsPerMinute: &zero,
	}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, populateUserCache(user))

	cached, err := GetUserCache(user.Id)
	require.NoError(t, err)
	require.NotNil(t, cached.RequestsPerMinute)
	assert.Equal(t, 0, *cached.RequestsPerMinute)

	gin.SetMode(gin.TestMode)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	cached.WriteContext(context)
	value, ok := context.Get("requests_per_minute")
	require.True(t, ok)
	rate, ok := value.(*int)
	require.True(t, ok)
	require.NotNil(t, rate)
	assert.Equal(t, 0, *rate)

	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Update("requests_per_minute", nil).Error)
	require.NoError(t, PublishUserAuthCache(user.Id))
	cached, err = GetUserCache(user.Id)
	require.NoError(t, err)
	assert.Nil(t, cached.RequestsPerMinute)

	context, _ = gin.CreateTestContext(httptest.NewRecorder())
	cached.WriteContext(context)
	value, ok = context.Get("requests_per_minute")
	require.True(t, ok)
	rate, ok = value.(*int)
	require.True(t, ok)
	assert.Nil(t, rate)
	assert.EqualValues(t, 1, cached.AuthVersion)
}
