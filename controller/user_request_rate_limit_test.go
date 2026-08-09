package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func performAdminUserUpdateRequest(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/user/", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("id", 9999)
	context.Set("role", common.RoleAdminUser)
	UpdateUser(context)
	return recorder
}

func userUpdateBody(userID int, requestsPerMinute string) string {
	return fmt.Sprintf(`{"id":%d,"username":"managed-rate-user","display_name":"Managed Rate User","role":%d,"group":"default","requests_per_minute":%s}`,
		userID, common.RoleCommonUser, requestsPerMinute)
}

func userUpdateBodyWithoutRequestsPerMinute(userID int) string {
	return fmt.Sprintf(`{"id":%d,"username":"managed-rate-user","display_name":"Managed Rate User","role":%d,"group":"default"}`,
		userID, common.RoleCommonUser)
}

func loadUserRequestsPerMinute(t *testing.T, db *gorm.DB, userID int) *int {
	t.Helper()
	var user model.User
	require.NoError(t, db.First(&user, userID).Error)
	return user.RequestsPerMinute
}

func TestAdminUserUpdatePreservesPresenceAndStoresNilZeroAndPositive(t *testing.T) {
	db := setupManageUserTestDB(t)
	initial := 60
	user := model.User{
		Username:          "managed-rate-user",
		Password:          "password",
		Role:              common.RoleCommonUser,
		Status:            common.UserStatusEnabled,
		Group:             "default",
		AuthVersion:       1,
		RequestsPerMinute: &initial,
	}
	require.NoError(t, db.Create(&user).Error)

	assert.Equal(t, http.StatusOK, performAdminUserUpdateRequest(t, userUpdateBodyWithoutRequestsPerMinute(user.Id)).Code)
	assert.Equal(t, 60, *loadUserRequestsPerMinute(t, db, user.Id))

	assert.Equal(t, http.StatusOK, performAdminUserUpdateRequest(t, userUpdateBody(user.Id, "null")).Code)
	assert.Nil(t, loadUserRequestsPerMinute(t, db, user.Id))

	assert.Equal(t, http.StatusOK, performAdminUserUpdateRequest(t, userUpdateBody(user.Id, "0")).Code)
	rate := loadUserRequestsPerMinute(t, db, user.Id)
	require.NotNil(t, rate)
	assert.Equal(t, 0, *rate)

	assert.Equal(t, http.StatusOK, performAdminUserUpdateRequest(t, userUpdateBody(user.Id, "120")).Code)
	rate = loadUserRequestsPerMinute(t, db, user.Id)
	require.NotNil(t, rate)
	assert.Equal(t, 120, *rate)

	for _, value := range []int{-1, setting.MaxUserRequestsPerMinute + 1} {
		response := performAdminUserUpdateRequest(t, userUpdateBody(user.Id, fmt.Sprintf("%d", value)))
		assert.Equal(t, http.StatusBadRequest, response.Code)
	}
	rate = loadUserRequestsPerMinute(t, db, user.Id)
	require.NotNil(t, rate)
	assert.Equal(t, 120, *rate)

	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	assert.EqualValues(t, 1, stored.AuthVersion)
}

func TestUpdateSelfCannotChangeRequestsPerMinute(t *testing.T) {
	db := setupManageUserTestDB(t)
	rate := 42
	user := model.User{
		Username:          "self-rate-user",
		Password:          "password",
		Role:              common.RoleCommonUser,
		Status:            common.UserStatusEnabled,
		Group:             "default",
		AuthVersion:       1,
		RequestsPerMinute: &rate,
	}
	require.NoError(t, db.Create(&user).Error)

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPut, "/api/user/self", strings.NewReader(`{"display_name":"Updated Self","requests_per_minute":0}`))
	context.Request.Header.Set("Content-Type", "application/json")
	context.Set("id", user.Id)
	UpdateSelf(context)

	assert.Equal(t, http.StatusOK, recorder.Code)
	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	require.NotNil(t, stored.RequestsPerMinute)
	assert.Equal(t, 42, *stored.RequestsPerMinute)
	assert.Equal(t, "Updated Self", stored.DisplayName)
}
