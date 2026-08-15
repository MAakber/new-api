package controller

import (
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type channelCustomBalanceUpdateRequest struct {
	Enabled         *bool            `json:"enabled"`
	Provider        *string          `json:"provider"`
	UseChannelKey   *bool            `json:"use_channel_key"`
	AuthType        *string          `json:"auth_type"`
	Credential      *string          `json:"credential"`
	ClearCredential bool             `json:"clear_credential"`
	UserID          *json.RawMessage `json:"user_id"`
	QuotaPerUnit    *float64         `json:"quota_per_unit"`
	AutoBalance     *bool            `json:"auto_balance"`
	AutoCheckin     *bool            `json:"auto_checkin"`

	BalanceIntervalSeconds *int64 `json:"balance_interval_seconds"`
	CheckinIntervalSeconds *int64 `json:"checkin_interval_seconds"`
	RetryMax               *int   `json:"retry_max"`
	RetryMaxAttempts       *int   `json:"retry_max_attempts"`
	RetryIntervalSeconds   *int64 `json:"retry_interval_seconds"`
}

func (request channelCustomBalanceUpdateRequest) serviceInput() (service.ChannelCustomBalanceUpdate, error) {
	userID, err := parseChannelCustomBalanceUserID(request.UserID)
	if err != nil {
		return service.ChannelCustomBalanceUpdate{}, err
	}
	return service.ChannelCustomBalanceUpdate{
		Enabled:                request.Enabled,
		Provider:               request.Provider,
		UseChannelKey:          request.UseChannelKey,
		AuthType:               request.AuthType,
		Credential:             request.Credential,
		ClearCredential:        request.ClearCredential,
		UserID:                 userID,
		QuotaPerUnit:           request.QuotaPerUnit,
		AutoBalance:            request.AutoBalance,
		AutoCheckin:            request.AutoCheckin,
		BalanceIntervalSeconds: request.BalanceIntervalSeconds,
		CheckinIntervalSeconds: request.CheckinIntervalSeconds,
		RetryMax:               request.RetryMax,
		RetryMaxAttempts:       request.RetryMaxAttempts,
		RetryIntervalSeconds:   request.RetryIntervalSeconds,
	}, nil
}

func GetChannelCustomBalance(c *gin.Context) {
	channelID, err := parseChannelCustomBalanceID(c)
	if err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, err)
		return
	}
	view, err := service.GetChannelCustomBalanceView(channelID)
	if err != nil {
		writeChannelCustomBalanceError(c, channelCustomBalanceErrorStatus(err), err)
		return
	}
	common.ApiSuccess(c, view)
}

func UpdateChannelCustomBalance(c *gin.Context) {
	channelID, err := parseChannelCustomBalanceID(c)
	if err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, err)
		return
	}
	var request channelCustomBalanceUpdateRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, errors.New("invalid channel custom balance config"))
		return
	}
	input, err := request.serviceInput()
	if err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, err)
		return
	}
	view, err := service.UpdateChannelCustomBalanceConfig(c.Request.Context(), channelID, input)
	if err != nil {
		writeChannelCustomBalanceError(c, channelCustomBalanceErrorStatus(err), err)
		return
	}
	common.ApiSuccess(c, view)
}

func parseChannelCustomBalanceUserID(raw *json.RawMessage) (*string, error) {
	if raw == nil {
		return nil, nil
	}
	if strings.TrimSpace(string(*raw)) == "null" {
		text := ""
		return &text, nil
	}
	var text string
	if err := common.Unmarshal(*raw, &text); err == nil {
		return &text, nil
	}
	var number json.Number
	if err := common.Unmarshal(*raw, &number); err != nil {
		return nil, errors.New("user_id must be a non-negative integer or string")
	}
	integer, ok := new(big.Int).SetString(number.String(), 10)
	if !ok || integer.Sign() < 0 {
		return nil, errors.New("user_id must be a non-negative integer or string")
	}
	text = integer.String()
	return &text, nil
}

func RefreshChannelCustomBalance(c *gin.Context) {
	channelID, err := parseChannelCustomBalanceID(c)
	if err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, err)
		return
	}
	view, err := service.RefreshChannelCustomBalance(c.Request.Context(), channelID)
	if err != nil {
		writeChannelCustomBalanceActionError(c, err, view)
		return
	}
	common.ApiSuccess(c, view)
}

func CheckinChannelCustomBalance(c *gin.Context) {
	channelID, err := parseChannelCustomBalanceID(c)
	if err != nil {
		writeChannelCustomBalanceError(c, http.StatusBadRequest, err)
		return
	}
	view, err := service.CheckinChannelCustomBalance(c.Request.Context(), channelID)
	if err != nil {
		writeChannelCustomBalanceActionError(c, err, view)
		return
	}
	common.ApiSuccess(c, view)
}

func parseChannelCustomBalanceID(c *gin.Context) (int, error) {
	channelID, err := strconv.Atoi(c.Param("id"))
	if err != nil || channelID <= 0 {
		return 0, errors.New("invalid channel id")
	}
	return channelID, nil
}

func writeChannelCustomBalanceError(c *gin.Context, status int, err error) {
	if err == nil {
		err = errors.New("channel custom balance operation failed")
	}
	c.JSON(status, gin.H{"success": false, "message": err.Error()})
}

func writeChannelCustomBalanceActionError(c *gin.Context, err error, view *service.ChannelCustomBalanceView) {
	status := channelCustomBalanceErrorStatus(err)
	response := gin.H{"success": false, "message": err.Error()}
	if view != nil {
		response["data"] = view
	}
	c.JSON(status, response)
}

func channelCustomBalanceErrorStatus(err error) int {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return http.StatusNotFound
	case errors.Is(err, service.ErrChannelCustomBalanceBusy):
		return http.StatusConflict
	case errors.Is(err, service.ErrChannelCustomBalanceNotConfigured):
		return http.StatusBadRequest
	case errors.Is(err, service.ErrChannelCustomBalanceConfig):
		return http.StatusBadRequest
	default:
		return http.StatusBadGateway
	}
}
