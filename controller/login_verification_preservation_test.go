package controller

import (
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/pquerna/otp/totp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSecurityLoginAutoBanAtEveryAuthorizationBoundary(t *testing.T) {
	for _, boundary := range []string{"primary authentication", "factor validation", "session commit"} {
		t.Run(boundary, func(t *testing.T) {
			user, _ := setupSecurityEnrollmentTest(t)
			factor := &model.TwoFA{UserId: user.Id, Secret: "JBSWY3DPEHPK3PXP", IsEnabled: true}
			require.NoError(t, model.DB.Create(factor).Error)
			var challenge *service.LoginChallenge
			var verification *service.LoginVerification
			var err error
			if boundary != "primary authentication" {
				challenge, err = service.StartLoginVerification(user, "password")
				require.NoError(t, err)
				require.NotNil(t, challenge)
			}
			if boundary == "session commit" {
				verification, err = service.RequireLoginVerification(challenge.FlowToken, service.VerificationMethodTwoFA)
				require.NoError(t, err)
				code, err := totp.GenerateCode(factor.Secret, time.Now())
				require.NoError(t, err)
				require.NoError(t, service.VerifyTwoFactorCode(factor, code))
			}
			banUntil := time.Now().Add(time.Hour).Unix()
			// Keep the earlier authentication snapshot and cache unchanged. Each
			// boundary must observe the authoritative ban before issuing a session.
			require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Updates(map[string]any{
				"auto_ban_until": banUntil, "auto_ban_rule": "sensitive_words",
				"auto_ban_response_status":  http.StatusUnavailableForLegalReasons,
				"auto_ban_response_code":    "sensitive_content_blocked",
				"auto_ban_response_message": "Temporarily blocked by content policy",
			}).Error)
			switch boundary {
			case "primary authentication":
				challenge, err = service.StartLoginVerification(user, "password")
				assert.Nil(t, challenge)
			case "factor validation":
				verification, err = service.RequireLoginVerification(challenge.FlowToken, service.VerificationMethodTwoFA)
				assert.Nil(t, verification)
			case "session commit":
				var bundle *service.AuthBundle
				bundle, err = service.CompleteLoginVerification(challenge.FlowToken, verification, service.VerificationMethodTwoFA, "127.0.0.1", "ban-preservation")
				assert.Nil(t, bundle)
			}
			require.Error(t, err)
			response, banned := service.AutoBanResponseFromError(err)
			require.True(t, banned, "%v", err)
			assert.Equal(t, http.StatusUnavailableForLegalReasons, response.Status)
			assert.Equal(t, "sensitive_content_blocked", response.Code)
			assert.Equal(t, banUntil, response.Until)
			count, err := model.CountActiveUserSessions(user.Id, time.Now().Unix())
			require.NoError(t, err)
			assert.EqualValues(t, 1, count)
		})
	}
}

func TestSecurityLoginAcceptsSecondNamedPasskeyAndUpdatesOnlyThatDevice(t *testing.T) {
	user, _ := setupSecurityEnrollmentTest(t)
	newSecurityLoginPasskey(t, user.Id)
	secondKey := newSecurityLoginPasskey(t, user.Id)
	credentials, err := model.ListPasskeyCredentialsByUserID(user.Id)
	require.NoError(t, err)
	require.Len(t, credentials, 2)
	for index, name := range []string{"Laptop", "Phone"} {
		require.NoError(t, model.DB.Model(&credentials[index]).Update("display_name", name).Error)
	}
	pending, err := service.StartLoginVerification(user, "oauth:github")
	require.NoError(t, err)
	require.NotNil(t, pending)
	body, err := common.Marshal(map[string]string{"flow_token": pending.FlowToken})
	require.NoError(t, err)
	response := securityEnrollmentRequest("POST", "/api/user/login/passkey/begin", string(body), "", service.AuthIdentity{}, LoginPasskeyBegin)
	var begin struct {
		Success bool `json:"success"`
		Data    struct {
			FlowToken string `json:"flow_token"`
			Options   struct {
				PublicKey struct {
					Challenge string `json:"challenge"`
					Allowed   []struct {
						ID string `json:"id"`
					} `json:"allowCredentials"`
				} `json:"publicKey"`
			} `json:"options"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &begin))
	require.True(t, begin.Success, response.Body.String())
	require.Len(t, begin.Data.Options.PublicKey.Allowed, 2)
	secondID := sha256.Sum256(elliptic.Marshal(secondKey.Curve, secondKey.X, secondKey.Y))
	assert.Equal(t, base64.RawURLEncoding.EncodeToString(secondID[:]), begin.Data.Options.PublicKey.Allowed[1].ID)
	body, err = common.Marshal(map[string]any{
		"flow_token": pending.FlowToken, "passkey_flow_token": begin.Data.FlowToken,
		"credential": securityPasskeyResponse(t, secondKey, begin.Data.Options.PublicKey.Challenge, false, 0),
	})
	require.NoError(t, err)
	response = securityEnrollmentRequest("POST", "/api/user/login/passkey/finish", string(body), "", service.AuthIdentity{}, LoginPasskeyFinish)
	var result securityEnrollmentResponse
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	require.True(t, result.Success, response.Body.String())
	credentials, err = model.ListPasskeyCredentialsByUserID(user.Id)
	require.NoError(t, err)
	require.Len(t, credentials, 2)
	assert.Equal(t, "Laptop", credentials[0].DisplayName)
	assert.Nil(t, credentials[0].LastUsedAt)
	assert.Equal(t, "Phone", credentials[1].DisplayName)
	assert.NotNil(t, credentials[1].LastUsedAt)
}
