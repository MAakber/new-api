package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRegisterRequiresAndConsumesRegistrationCode(t *testing.T) {
	previousDB := model.DB
	previousDatabaseType := common.MainDatabaseType()
	previousRegisterEnabled := common.RegisterEnabled
	previousPasswordRegisterEnabled := common.PasswordRegisterEnabled
	previousRegistrationCodeEnabled := common.IsRegistrationCodeEnabled()
	previousEmailVerificationEnabled := common.EmailVerificationEnabled
	previousRedisEnabled := common.RedisEnabled
	previousGenerateDefaultToken := constant.GenerateDefaultToken

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Redemption{}, &model.RegistrationCodeUse{}, &model.Option{}))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.SetRegistrationCodeEnabled(true)
	common.EmailVerificationEnabled = false
	common.RedisEnabled = false
	constant.GenerateDefaultToken = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RegisterEnabled = previousRegisterEnabled
		common.PasswordRegisterEnabled = previousPasswordRegisterEnabled
		common.SetRegistrationCodeEnabled(previousRegistrationCodeEnabled)
		common.EmailVerificationEnabled = previousEmailVerificationEnabled
		common.RedisEnabled = previousRedisEnabled
		constant.GenerateDefaultToken = previousGenerateDefaultToken
	})
	require.NoError(t, db.Create(&model.Option{Key: "RegistrationCodeEnabled", Value: "true"}).Error)

	code := model.Redemption{
		Name:        "registration",
		Key:         "50000000000000000000000000000001",
		Status:      common.RedemptionCodeStatusEnabled,
		CodeType:    model.RedemptionCodeTypeRegistration,
		MaxUses:     1,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, db.Create(&code).Error)

	missingCodeRecorder := httptest.NewRecorder()
	missingCodeContext, _ := gin.CreateTestContext(missingCodeRecorder)
	missingCodeContext.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(`{"username":"missing-code","password":"password123"}`))
	missingCodeContext.Request.Header.Set("Content-Type", "application/json")
	Register(missingCodeContext)
	assert.Contains(t, missingCodeRecorder.Body.String(), "registration_code_invalid")

	invalidCodeRecorder := httptest.NewRecorder()
	invalidCodeContext, _ := gin.CreateTestContext(invalidCodeRecorder)
	invalidCodeContext.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(`{"username":"invalid-code","password":"password123","registration_code":"invalid"}`))
	invalidCodeContext.Request.Header.Set("Content-Type", "application/json")
	Register(invalidCodeContext)
	assert.Contains(t, invalidCodeRecorder.Body.String(), "registration_code_invalid")
	var invalidUserCount int64
	require.NoError(t, db.Model(&model.User{}).Where("username = ?", "invalid-code").Count(&invalidUserCount).Error)
	assert.Zero(t, invalidUserCount)

	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(`{"username":"with-code","password":"password123","registration_code":"50000000000000000000000000000001"}`))
	context.Request.Header.Set("Content-Type", "application/json")
	Register(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"success":true`)

	var storedCode model.Redemption
	require.NoError(t, db.First(&storedCode, code.Id).Error)
	assert.Equal(t, 1, storedCode.UsedCount)
	assert.Equal(t, common.RedemptionCodeStatusUsed, storedCode.Status)

	var count int64
	require.NoError(t, db.Model(&model.User{}).Where("username = ?", "with-code").Count(&count).Error)
	assert.Equal(t, int64(1), count)
}
