package controller

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPasswordLoginEncryptionPreservesAuthentication(t *testing.T) {
	require.NoError(t, i18n.Init())
	previousDB, previousLogs := model.DB, model.LOG_DB
	previousLogin, previousEncryption := common.PasswordLoginEnabled, common.PasswordLoginEncryptionEnabled
	previousRedis, previousSecret := common.RedisEnabled, common.SessionSecret
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogs
		common.PasswordLoginEnabled, common.PasswordLoginEncryptionEnabled = previousLogin, previousEncryption
		common.RedisEnabled, common.SessionSecret = previousRedis, previousSecret
		common.SetDatabaseTypes(previousMainType, previousLogType)
	})
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserAvatar{}, &model.UserSession{}, &model.TwoFA{}, &model.PasskeyCredential{}, &model.AuthFlow{}, &model.Log{}, &model.AuditLog{}, &model.LoginEncryptionKey{}))
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled, common.PasswordLoginEnabled = false, true
	common.SessionSecret = "isolated-password-login-fixture"
	require.NoError(t, model.InitPasswordEncryption())
	const password = "fixture-密码"
	hash, err := common.Password2Hash(password)
	require.NoError(t, err)
	rpm := 23
	user := model.User{Username: "encrypted-login", Password: hash, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, RequestsPerMinute: &rpm}
	require.NoError(t, db.Create(&user).Error)
	keyID, publicPEM := common.PasswordEncryptionPublicKey()
	block, _ := pem.Decode([]byte(publicPEM))
	require.NotNil(t, block)
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	require.NoError(t, err)
	publicKey, ok := parsed.(*rsa.PublicKey)
	require.True(t, ok)
	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, []byte(password), nil)
	require.NoError(t, err)
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/user/login/encryption-key", GetPasswordEncryptionKey)
	router.POST("/api/user/login", Login)

	for _, tc := range []struct {
		name                       string
		enabled                    bool
		password, encrypted, keyID string
		success                    bool
	}{
		{"disabled keeps normal login", false, password, "", "", true},
		{"enabled decrypts login", true, "", encoded, keyID, true},
		{"enabled rejects plaintext", true, password, "", "", false},
		{"invalid ciphertext cannot fall back to plaintext", true, password, "invalid", keyID, false},
		{"stale key is rejected", true, "", encoded, "previous-key", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			common.PasswordLoginEncryptionEnabled = tc.enabled
			keyResponse := httptest.NewRecorder()
			router.ServeHTTP(keyResponse, httptest.NewRequest(http.MethodGet, "/api/user/login/encryption-key", nil))
			var keyPayload struct {
				Success bool                   `json:"success"`
				Data    map[string]interface{} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(keyResponse.Body.Bytes(), &keyPayload))
			assert.True(t, keyPayload.Success)
			assert.Equal(t, tc.enabled, keyPayload.Data["enabled"])
			if !tc.enabled {
				assert.Equal(t, map[string]interface{}{"enabled": false}, keyPayload.Data)
			}
			body, err := common.Marshal(LoginRequest{Username: user.Username, Password: tc.password, PasswordEncrypted: tc.encrypted, EncryptionKeyID: tc.keyID})
			require.NoError(t, err)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/user/login", bytes.NewReader(body)))
			var response struct {
				Success bool `json:"success"`
				Data    struct {
					AccessToken string                   `json:"access_token"`
					Session     service.LoginSessionView `json:"session"`
					User        map[string]interface{}   `json:"user"`
				} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.Equal(t, tc.success, response.Success, recorder.Body.String())
			if tc.success {
				assert.NotEmpty(t, response.Data.AccessToken)
				assert.Equal(t, "password", response.Data.Session.LoginMethod)
				assert.EqualValues(t, rpm, response.Data.User["requests_per_minute"])
				assert.NotContains(t, response.Data.User, "password")
				assert.Contains(t, recorder.Header().Get("Set-Cookie"), service.RefreshCookieName)
			}
		})
	}
	var sessions, audits int64
	require.NoError(t, db.Model(&model.UserSession{}).Count(&sessions).Error)
	require.NoError(t, db.Model(&model.AuditLog{}).Where("category = ?", model.AuditCategoryLogin).Count(&audits).Error)
	assert.EqualValues(t, 2, sessions)
	assert.EqualValues(t, 2, audits)

	// An encrypted password still requires the configured second factor.
	require.NoError(t, db.Create(&model.TwoFA{UserId: user.Id, Secret: "fixture-secret", IsEnabled: true}).Error)
	common.PasswordLoginEncryptionEnabled = true
	body, err := common.Marshal(LoginRequest{Username: user.Username, PasswordEncrypted: encoded, EncryptionKeyID: keyID})
	require.NoError(t, err)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/api/user/login", bytes.NewReader(body)))
	var response struct {
		Success bool `json:"success"`
		Data    struct {
			service.LoginChallenge
			AccessToken string `json:"access_token"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	assert.True(t, response.Data.RequireVerification)
	assert.Equal(t, []service.VerificationMethodOption{{Method: service.VerificationMethodTwoFA, Available: true}}, response.Data.Methods)
	assert.NotEmpty(t, response.Data.FlowToken)
	assert.Empty(t, response.Data.AccessToken)
	assert.Empty(t, recorder.Header().Get("Set-Cookie"))
}
