package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRegistrationCompletionTest(t *testing.T) *gorm.DB {
	t.Helper()
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousDatabaseType := common.MainDatabaseType()
	previousRegisterEnabled := common.RegisterEnabled
	previousPasswordRegisterEnabled := common.PasswordRegisterEnabled
	previousRegistrationCodeEnabled := common.IsRegistrationCodeEnabled()
	previousEmailVerificationEnabled := common.EmailVerificationEnabled
	previousRedisEnabled := common.RedisEnabled
	previousWeChatAuthEnabled := common.WeChatAuthEnabled
	previousGenerateDefaultToken := constant.GenerateDefaultToken

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.AuthFlow{},
		&model.ExternalIdentityClaim{},
		&model.Redemption{},
		&model.RegistrationCodeUse{},
		&model.Option{},
	))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.SetRegistrationCodeEnabled(true)
	common.EmailVerificationEnabled = false
	common.RedisEnabled = false
	common.WeChatAuthEnabled = true
	constant.GenerateDefaultToken = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RegisterEnabled = previousRegisterEnabled
		common.PasswordRegisterEnabled = previousPasswordRegisterEnabled
		common.SetRegistrationCodeEnabled(previousRegistrationCodeEnabled)
		common.EmailVerificationEnabled = previousEmailVerificationEnabled
		common.RedisEnabled = previousRedisEnabled
		common.WeChatAuthEnabled = previousWeChatAuthEnabled
		constant.GenerateDefaultToken = previousGenerateDefaultToken
	})
	require.NoError(t, db.Create(&model.Option{Key: "RegistrationCodeEnabled", Value: "true"}).Error)
	return db
}

func requestRegistration(t *testing.T, body string) pendingRegistrationChallenge {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/register", strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	Register(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool                         `json:"success"`
		Data    pendingRegistrationChallenge `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	require.True(t, response.Success)
	require.True(t, response.Data.RequireRegistrationCode)
	require.NotEmpty(t, response.Data.FlowToken)
	return response.Data
}

func completeRegistration(t *testing.T, flowToken, registrationCode string) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	body, err := common.Marshal(completeRegistrationRequest{FlowToken: flowToken, RegistrationCode: registrationCode})
	require.NoError(t, err)
	context.Request = httptest.NewRequest(http.MethodPost, "/api/user/register/complete", strings.NewReader(string(body)))
	context.Request.Header.Set("Content-Type", "application/json")
	CompleteRegistration(context)
	return recorder
}

func TestRegisterDefersAccountCreationUntilRegistrationCodeCompletion(t *testing.T) {
	db := setupRegistrationCompletionTest(t)
	challenge := requestRegistration(t, `{"username":"with-code","password":"password123"}`)

	var count int64
	require.NoError(t, db.Model(&model.User{}).Where("username = ?", "with-code").Count(&count).Error)
	assert.Zero(t, count)
	flow, err := model.GetAuthFlow(challenge.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeRegistration})
	require.NoError(t, err)
	var payload pendingRegistrationPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	assert.NotEqual(t, "password123", payload.User.PasswordHash)
	assert.True(t, common.ValidatePasswordAndHash("password123", payload.User.PasswordHash))
}

func TestCompleteRegistrationConsumesCodeAndFlowAtomically(t *testing.T) {
	db := setupRegistrationCompletionTest(t)
	code := model.Redemption{
		Name:        "registration",
		Key:         "50000000000000000000000000000001",
		Status:      common.RedemptionCodeStatusEnabled,
		CodeType:    model.RedemptionCodeTypeRegistration,
		MaxUses:     1,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, db.Create(&code).Error)
	challenge := requestRegistration(t, `{"username":"with-code","password":"password123"}`)

	invalid := completeRegistration(t, challenge.FlowToken, "invalid")
	assert.Contains(t, invalid.Body.String(), "Registration code is invalid or unavailable")
	_, err := model.GetAuthFlow(challenge.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeRegistration})
	require.NoError(t, err)

	completed := completeRegistration(t, challenge.FlowToken, code.Key)
	require.Equal(t, http.StatusOK, completed.Code)
	assert.Contains(t, completed.Body.String(), `"success":true`)

	var storedCode model.Redemption
	require.NoError(t, db.First(&storedCode, code.Id).Error)
	assert.Equal(t, 1, storedCode.UsedCount)
	assert.Equal(t, common.RedemptionCodeStatusUsed, storedCode.Status)
	var user model.User
	require.NoError(t, db.Where("username = ?", "with-code").First(&user).Error)
	assert.True(t, common.ValidatePasswordAndHash("password123", user.Password))
	_, err = model.GetAuthFlow(challenge.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeRegistration})
	assert.ErrorIs(t, err, model.ErrAuthFlowConsumed)

	replay := completeRegistration(t, challenge.FlowToken, code.Key)
	assert.Contains(t, replay.Body.String(), registrationFlowInvalidCode)
	var useCount int64
	require.NoError(t, db.Model(&model.RegistrationCodeUse{}).Count(&useCount).Error)
	assert.Equal(t, int64(1), useCount)
}

func TestOAuthRegistrationReturnsChallengeOnlyForNewAccounts(t *testing.T) {
	setupRegistrationCompletionTest(t)
	provider := &authFlowTestOAuthProvider{}

	user, challenge, err := findOrCreateOAuthUser("auth-flow-test", provider, &oauth.OAuthUser{
		ProviderUserID: "new-provider-user",
		Username:       "new-oauth-user",
	}, "")
	require.NoError(t, err)
	assert.Nil(t, user)
	require.NotNil(t, challenge)
	assert.True(t, challenge.RequireRegistrationCode)

	existing := model.User{
		Username:    "existing-oauth-user",
		DisplayName: "existing-oauth-user",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
	}
	require.NoError(t, existing.InsertWithTx(model.DB, 0))
	existingProvider := &existingOAuthTestProvider{user: existing, providerUserId: "existing-provider-user"}
	user, challenge, err = findOrCreateOAuthUser("auth-flow-existing", existingProvider, &oauth.OAuthUser{
		ProviderUserID: "existing-provider-user",
	}, "")
	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, existing.Id, user.Id)
	assert.Nil(t, challenge)
}

type existingOAuthTestProvider struct {
	user           model.User
	providerUserId string
}

func (*existingOAuthTestProvider) GetName() string { return "Existing OAuth" }
func (*existingOAuthTestProvider) IsEnabled() bool { return true }
func (*existingOAuthTestProvider) ExchangeToken(context.Context, string, *gin.Context) (*oauth.OAuthToken, error) {
	return &oauth.OAuthToken{}, nil
}
func (*existingOAuthTestProvider) GetUserInfo(context.Context, *oauth.OAuthToken) (*oauth.OAuthUser, error) {
	return nil, nil
}
func (provider *existingOAuthTestProvider) IsUserIDTaken(providerUserId string) bool {
	return providerUserId == provider.providerUserId
}
func (provider *existingOAuthTestProvider) FillUserByProviderID(user *model.User, _ string) error {
	*user = provider.user
	return nil
}
func (*existingOAuthTestProvider) SetProviderUserID(*model.User, string) {}
func (*existingOAuthTestProvider) GetProviderPrefix() string             { return "existing_" }
