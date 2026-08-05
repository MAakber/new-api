package controller

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	pendingRegistrationFlowTTL = 10 * time.Minute

	pendingRegistrationPassword = "password"
	pendingRegistrationOAuth    = "oauth"
	pendingRegistrationWeChat   = "wechat"

	registrationFlowInvalidCode = "REGISTRATION_FLOW_INVALID"
)

var errPendingRegistrationIdentityClaimed = errors.New("pending registration identity is already claimed")
var errPendingRegistrationDisabled = errors.New("pending registration is disabled")
var errPendingPasswordRegistrationDisabled = errors.New("pending password registration is disabled")

type pendingRegistrationUser struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash,omitempty"`
	DisplayName  string `json:"display_name"`
	Email        string `json:"email,omitempty"`
	WeChatId     string `json:"wechat_id,omitempty"`
}

type pendingRegistrationPayload struct {
	Method         string                  `json:"method"`
	User           pendingRegistrationUser `json:"user"`
	InviterId      int                     `json:"inviter_id,omitempty"`
	Provider       string                  `json:"provider,omitempty"`
	ProviderUserId string                  `json:"provider_user_id,omitempty"`
}

type pendingRegistrationChallenge struct {
	RequireRegistrationCode bool   `json:"require_registration_code"`
	FlowToken               string `json:"flow_token"`
	ExpiresAt               int64  `json:"expires_at"`
}

type completeRegistrationRequest struct {
	FlowToken        string `json:"flow_token"`
	RegistrationCode string `json:"registration_code"`
}

func createPendingRegistration(payload pendingRegistrationPayload) (*pendingRegistrationChallenge, error) {
	payloadJson, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	expiresAt := time.Now().Add(pendingRegistrationFlowTTL)
	flowToken, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeRegistration,
		Provider:  payload.Provider,
		Intent:    payload.Method,
		Payload:   string(payloadJson),
		ExpiresAt: expiresAt,
	})
	if err != nil {
		return nil, err
	}
	return &pendingRegistrationChallenge{
		RequireRegistrationCode: true,
		FlowToken:               flowToken,
		ExpiresAt:               expiresAt.Unix(),
	}, nil
}

func writePendingRegistration(c *gin.Context, challenge *pendingRegistrationChallenge) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    challenge,
	})
}

func writeRegistrationFlowInvalid(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": false,
		"code":    registrationFlowInvalidCode,
		"message": i18n.T(c, i18n.MsgUserRegistrationFlowInvalid),
	})
}

func CompleteRegistration(c *gin.Context) {
	var request completeRegistrationRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiErrorI18n(c, i18n.MsgInvalidParams)
		return
	}
	request.FlowToken = strings.TrimSpace(request.FlowToken)
	request.RegistrationCode = strings.TrimSpace(request.RegistrationCode)
	if request.FlowToken == "" || request.RegistrationCode == "" || len(request.RegistrationCode) > 128 {
		common.ApiErrorI18n(c, i18n.MsgUserRegistrationCodeInvalid)
		return
	}

	var createdUser model.User
	var completedMethod string
	var completedProvider string
	var inviterId int
	_, err := model.ConsumeAuthFlowWithAction(request.FlowToken, model.AuthFlowMatch{
		Purpose: model.AuthFlowPurposeRegistration,
	}, func(tx *gorm.DB, flow *model.AuthFlow) error {
		var payload pendingRegistrationPayload
		if err := common.UnmarshalJsonStr(flow.Payload, &payload); err != nil {
			return model.ErrAuthFlowInvalid
		}
		if payload.Method == "" || payload.Method != flow.Intent || payload.Provider != flow.Provider {
			return model.ErrAuthFlowInvalid
		}
		if !common.RegisterEnabled {
			return errPendingRegistrationDisabled
		}
		defaultTokenKey := ""
		if constant.GenerateDefaultToken && payload.Method == pendingRegistrationPassword {
			var err error
			defaultTokenKey, err = common.GenerateKey()
			if err != nil {
				return err
			}
		}

		user := model.User{
			Username:    payload.User.Username,
			DisplayName: payload.User.DisplayName,
			Email:       payload.User.Email,
			Role:        common.RoleCommonUser,
			Status:      common.UserStatusEnabled,
		}
		switch payload.Method {
		case pendingRegistrationPassword:
			if !common.PasswordRegisterEnabled {
				return errPendingPasswordRegistrationDisabled
			}
			if payload.User.PasswordHash == "" {
				return model.ErrAuthFlowInvalid
			}
			user.Password = payload.User.PasswordHash
			if err := user.InsertPreparedWithTx(tx, payload.InviterId); err != nil {
				return err
			}
		case pendingRegistrationOAuth:
			provider := oauth.GetProvider(payload.Provider)
			if provider == nil || !provider.IsEnabled() || payload.ProviderUserId == "" || provider.IsUserIDTaken(payload.ProviderUserId) {
				return errPendingRegistrationIdentityClaimed
			}
			if genericProvider, ok := provider.(*oauth.GenericOAuthProvider); ok {
				if err := user.InsertWithTx(tx, payload.InviterId); err != nil {
					return err
				}
				if err := model.CreateUserOAuthBindingWithTx(tx, &model.UserOAuthBinding{
					UserId:         user.Id,
					ProviderId:     genericProvider.GetProviderId(),
					ProviderUserId: payload.ProviderUserId,
				}); err != nil {
					return err
				}
			} else {
				provider.SetProviderUserID(&user, payload.ProviderUserId)
				if err := user.InsertWithTx(tx, payload.InviterId); err != nil {
					return err
				}
			}
		case pendingRegistrationWeChat:
			if !common.WeChatAuthEnabled {
				return errPendingRegistrationDisabled
			}
			if payload.User.WeChatId == "" || model.IsWeChatIdAlreadyTaken(payload.User.WeChatId) {
				return errPendingRegistrationIdentityClaimed
			}
			user.WeChatId = payload.User.WeChatId
			if err := user.InsertWithTx(tx, payload.InviterId); err != nil {
				return err
			}
		default:
			return model.ErrAuthFlowInvalid
		}

		if err := model.ConsumeRegistrationCodeWithTx(tx, request.RegistrationCode, user.Id); err != nil {
			return err
		}
		if defaultTokenKey != "" && payload.Method == pendingRegistrationPassword {
			token := model.Token{
				UserId:             user.Id,
				Name:               user.Username + "的初始令牌",
				Key:                defaultTokenKey,
				CreatedTime:        common.GetTimestamp(),
				AccessedTime:       common.GetTimestamp(),
				ExpiredTime:        -1,
				RemainQuota:        500000,
				UnlimitedQuota:     true,
				ModelLimitsEnabled: false,
			}
			if setting.DefaultUseAutoGroup {
				token.Group = "auto"
			}
			if err := tx.Create(&token).Error; err != nil {
				return err
			}
		}

		createdUser = user
		completedMethod = payload.Method
		completedProvider = payload.Provider
		inviterId = payload.InviterId
		return nil
	})
	if err != nil {
		switch {
		case errors.Is(err, errPendingPasswordRegistrationDisabled):
			common.ApiErrorI18n(c, i18n.MsgUserPasswordRegisterDisabled)
		case errors.Is(err, errPendingRegistrationDisabled):
			common.ApiErrorI18n(c, i18n.MsgUserRegisterDisabled)
		case errors.Is(err, errPendingRegistrationIdentityClaimed):
			common.ApiErrorI18n(c, i18n.MsgOAuthAlreadyBound, map[string]any{"Provider": "OAuth"})
		case errors.Is(err, model.ErrAuthFlowInvalid), errors.Is(err, model.ErrAuthFlowExpired), errors.Is(err, model.ErrAuthFlowConsumed):
			writeRegistrationFlowInvalid(c)
		case errors.Is(err, model.ErrRegistrationCodeUnavailable):
			common.ApiErrorI18n(c, i18n.MsgUserRegistrationCodeInvalid)
		case errors.Is(err, model.ErrEmailAlreadyTaken):
			common.ApiErrorI18n(c, i18n.MsgUserEmailAlreadyTaken)
		case isDuplicateRegistrationError(err):
			common.ApiErrorI18n(c, i18n.MsgUserExists)
		default:
			common.ApiError(c, err)
		}
		return
	}

	if completedMethod == pendingRegistrationOAuth {
		createdUser.FinalizeOAuthUserCreation(inviterId)
		c.Set("login_method_override", "oauth:"+completedProvider)
		setupLogin(&createdUser, c)
		return
	}
	createdUser.FinishInsert(inviterId)
	if completedMethod == pendingRegistrationWeChat {
		c.Set("login_method_override", "wechat")
		setupLogin(&createdUser, c)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func isDuplicateRegistrationError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "unique constraint") ||
		strings.Contains(message, "duplicate entry") ||
		strings.Contains(message, "duplicate key")
}
