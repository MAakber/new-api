package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	ChannelCustomBalanceProviderNewAPI    = "new_api"
	ChannelCustomBalanceProviderOneAPI    = "one_api"
	ChannelCustomBalanceProviderVeloera   = "veloera"
	ChannelCustomBalanceProviderAnyRouter = "anyrouter"

	ChannelCustomBalanceAuthToken  = "token"
	ChannelCustomBalanceAuthCookie = "cookie"

	ChannelCustomBalanceDefaultQuotaPerUnit    = 500000.0
	ChannelCustomBalanceDefaultBalanceInterval = int64(time.Hour / time.Second)
	ChannelCustomBalanceDefaultCheckinInterval = int64(24 * time.Hour / time.Second)
	ChannelCustomBalanceDefaultRetryMax        = 3
	ChannelCustomBalanceDefaultRetryInterval   = int64(5 * time.Minute / time.Second)

	ChannelCustomBalanceMaxIntervalSeconds  = int64(365 * 24 * time.Hour / time.Second)
	ChannelCustomBalanceMaxRetryMax         = 20
	ChannelCustomBalanceMaxQuotaPerUnit     = 1e12
	ChannelCustomBalanceMaxQuotaValue       = 1e18
	ChannelCustomBalanceMaxBalance          = 1e12
	ChannelCustomBalanceMaxUserIDLength     = 128
	ChannelCustomBalanceMaxCredentialLength = 4096
	channelCustomBalanceHTTPTimeout         = 15 * time.Second
	channelCustomBalanceMaxResponseBytes    = 1 << 20
	channelCustomBalanceLeaseTTL            = 2 * time.Minute
)

var (
	ErrChannelCustomBalanceBusy          = errors.New("channel custom balance operation is already running")
	ErrChannelCustomBalanceNotConfigured = errors.New("channel custom balance is not configured")
	ErrChannelCustomBalanceConfig        = errors.New("invalid channel custom balance config")
	channelCustomBalanceLocks            sync.Map
)

// ChannelCustomBalanceView is the public, credential-free representation of
// the configuration and its latest execution state.
type ChannelCustomBalanceView struct {
	ChannelID     int     `json:"channel_id"`
	Enabled       bool    `json:"enabled"`
	Provider      string  `json:"provider"`
	UseChannelKey bool    `json:"use_channel_key"`
	AuthType      string  `json:"auth_type"`
	CredentialSet bool    `json:"credential_set"`
	UserID        string  `json:"user_id"`
	QuotaPerUnit  float64 `json:"quota_per_unit"`
	AutoBalance   bool    `json:"auto_balance"`
	AutoCheckin   bool    `json:"auto_checkin"`

	BalanceIntervalSeconds int64 `json:"balance_interval_seconds"`
	CheckinIntervalSeconds int64 `json:"checkin_interval_seconds"`
	RetryMax               int   `json:"retry_max"`
	RetryMaxAttempts       int   `json:"retry_max_attempts"`
	RetryIntervalSeconds   int64 `json:"retry_interval_seconds"`

	NextBalanceAt int64 `json:"next_balance_at"`
	NextCheckinAt int64 `json:"next_checkin_at"`
	LastBalanceAt int64 `json:"last_balance_at"`
	LastCheckinAt int64 `json:"last_checkin_at"`

	LastBalanceStatus  string `json:"last_balance_status"`
	LastBalanceError   string `json:"last_balance_error"`
	LastBalanceMessage string `json:"last_balance_message"`
	LastCheckinStatus  string `json:"last_checkin_status"`
	LastCheckinError   string `json:"last_checkin_error"`
	LastCheckinMessage string `json:"last_checkin_message"`

	Balance            float64 `json:"balance"`
	BalanceUpdatedTime int64   `json:"balance_updated_time"`
}

// ChannelCustomBalanceUpdate contains only fields supplied by the caller. A
// nil credential or an empty credential preserves the encrypted value. Set
// ClearCredential to explicitly remove the independent credential.
type ChannelCustomBalanceUpdate struct {
	Enabled         *bool
	Provider        *string
	UseChannelKey   *bool
	AuthType        *string
	Credential      *string
	ClearCredential bool
	UserID          *string
	QuotaPerUnit    *float64
	AutoBalance     *bool
	AutoCheckin     *bool

	BalanceIntervalSeconds *int64
	CheckinIntervalSeconds *int64
	RetryMax               *int
	RetryMaxAttempts       *int
	RetryIntervalSeconds   *int64
}

type channelCustomBalanceResult struct {
	Balance *float64
	Message string
	UserID  string
}

type ChannelCustomBalanceTaskSummary struct {
	Operation string `json:"operation"`
	Processed int    `json:"processed"`
	Succeeded int    `json:"succeeded"`
	Failed    int    `json:"failed"`
	Skipped   int    `json:"skipped"`
}

type channelCustomBalanceProvider interface {
	FetchBalance(context.Context, *model.Channel, *model.ChannelCustomBalance, string) (channelCustomBalanceResult, error)
	Checkin(context.Context, *model.Channel, *model.ChannelCustomBalance, string) (channelCustomBalanceResult, error)
}

type newAPICompatibleProvider struct{}

func (newAPICompatibleProvider) FetchBalance(ctx context.Context, channel *model.Channel, config *model.ChannelCustomBalance, credential string) (channelCustomBalanceResult, error) {
	status, body, err := doChannelCustomBalanceRequest(ctx, channel, config, credential, http.MethodGet, "/api/user/self")
	if err != nil {
		return channelCustomBalanceResult{}, err
	}
	if status < http.StatusOK || status >= http.StatusMultipleChoices {
		return channelCustomBalanceResult{}, fmt.Errorf("balance endpoint returned status %d", status)
	}
	balance, message, userID, err := parseChannelCustomBalanceResponse(body, config.QuotaPerUnit)
	if err != nil {
		return channelCustomBalanceResult{}, err
	}
	return channelCustomBalanceResult{Balance: &balance, Message: safeChannelCustomBalanceMessage(message, credential), UserID: userID}, nil
}

func (newAPICompatibleProvider) Checkin(ctx context.Context, channel *model.Channel, config *model.ChannelCustomBalance, credential string) (channelCustomBalanceResult, error) {
	status, body, err := doChannelCustomBalanceRequest(ctx, channel, config, credential, http.MethodPost, channelCustomBalanceCheckinEndpoint(config.Provider))
	if err != nil {
		return channelCustomBalanceResult{}, err
	}
	message := safeChannelCustomBalanceMessage(parseChannelCustomBalanceMessage(body), credential)
	if status >= http.StatusOK && status < http.StatusMultipleChoices {
		if isAlreadyCheckedInResponse(body) {
			return channelCustomBalanceResult{Message: "already checked in today"}, nil
		}
		if failed, failureMessage := channelCustomBalanceResponseFailure(body); failed {
			if failureMessage == "" {
				failureMessage = "check-in request failed"
			}
			return channelCustomBalanceResult{}, errors.New(safeChannelCustomBalanceMessage(failureMessage, credential))
		}
		return channelCustomBalanceResult{Message: message}, nil
	}
	if isAlreadyCheckedInResponse(body) {
		return channelCustomBalanceResult{Message: "already checked in today"}, nil
	}
	return channelCustomBalanceResult{}, fmt.Errorf("check-in endpoint returned status %d", status)
}

func channelCustomBalanceCheckinEndpoint(provider string) string {
	switch provider {
	case ChannelCustomBalanceProviderVeloera:
		return "/api/user/check_in"
	case ChannelCustomBalanceProviderAnyRouter:
		return "/api/user/sign_in"
	default:
		return "/api/user/checkin"
	}
}

func ValidateChannelCustomBalanceConfig(config *model.ChannelCustomBalance) error {
	if config == nil {
		return errors.New("channel custom balance config is nil")
	}
	if !isSupportedChannelCustomBalanceProvider(config.Provider) {
		return fmt.Errorf("%w: unsupported channel custom balance provider", ErrChannelCustomBalanceConfig)
	}
	if config.AuthType != ChannelCustomBalanceAuthToken && config.AuthType != ChannelCustomBalanceAuthCookie {
		return fmt.Errorf("%w: auth_type must be token or cookie", ErrChannelCustomBalanceConfig)
	}
	if strings.ContainsAny(config.UserID, "\r\n") {
		return fmt.Errorf("%w: user_id contains invalid characters", ErrChannelCustomBalanceConfig)
	}
	if config.UserID != "" && len([]rune(config.UserID)) > ChannelCustomBalanceMaxUserIDLength {
		return fmt.Errorf("%w: user_id is too long", ErrChannelCustomBalanceConfig)
	}
	if config.QuotaPerUnit <= 0 || math.IsNaN(config.QuotaPerUnit) || math.IsInf(config.QuotaPerUnit, 0) || config.QuotaPerUnit > ChannelCustomBalanceMaxQuotaPerUnit {
		return fmt.Errorf("%w: quota_per_unit must be a finite positive number within the allowed limit", ErrChannelCustomBalanceConfig)
	}
	if config.BalanceInterval <= 0 || config.BalanceInterval > ChannelCustomBalanceMaxIntervalSeconds {
		return fmt.Errorf("%w: balance_interval_seconds is outside the allowed range", ErrChannelCustomBalanceConfig)
	}
	if config.CheckinInterval <= 0 || config.CheckinInterval > ChannelCustomBalanceMaxIntervalSeconds {
		return fmt.Errorf("%w: checkin_interval_seconds is outside the allowed range", ErrChannelCustomBalanceConfig)
	}
	if config.RetryMax <= 0 || config.RetryMax > ChannelCustomBalanceMaxRetryMax {
		return fmt.Errorf("%w: retry_max is outside the allowed range", ErrChannelCustomBalanceConfig)
	}
	if config.RetryInterval <= 0 || config.RetryInterval > ChannelCustomBalanceMaxIntervalSeconds {
		return fmt.Errorf("%w: retry_interval_seconds is outside the allowed range", ErrChannelCustomBalanceConfig)
	}
	return nil
}

func GetChannelCustomBalanceView(channelID int) (*ChannelCustomBalanceView, error) {
	channel, err := model.GetChannelById(channelID, true)
	if err != nil {
		return nil, err
	}
	config, err := model.GetChannelCustomBalance(channelID)
	if err != nil {
		return nil, err
	}
	if config == nil {
		defaultConfig := defaultChannelCustomBalanceConfig(channelID)
		config = &defaultConfig
	} else {
		normalizeStoredChannelCustomBalanceConfig(config)
		if err := ValidateChannelCustomBalanceConfig(config); err != nil {
			return nil, err
		}
	}
	return channelCustomBalanceView(channel, config), nil
}

func UpdateChannelCustomBalanceConfig(ctx context.Context, channelID int, input ChannelCustomBalanceUpdate) (*ChannelCustomBalanceView, error) {
	var view *ChannelCustomBalanceView
	err := withChannelCustomBalanceLease(ctx, channelID, func() error {
		channel, err := model.GetChannelById(channelID, true)
		if err != nil {
			return err
		}
		current, err := model.GetChannelCustomBalance(channelID)
		if err != nil {
			return err
		}
		isNew := current == nil
		var config model.ChannelCustomBalance
		if isNew {
			config = defaultChannelCustomBalanceConfig(channelID)
		} else {
			config = *current
			normalizeStoredChannelCustomBalanceConfig(&config)
		}
		oldAutoBalance, oldAutoCheckin := config.AutoBalance, config.AutoCheckin

		if input.Enabled != nil {
			config.Enabled = *input.Enabled
		}
		if input.Provider != nil {
			config.Provider = strings.TrimSpace(strings.ToLower(*input.Provider))
		}
		if input.UseChannelKey != nil {
			config.UseChannelKey = *input.UseChannelKey
		}
		if input.AuthType != nil {
			config.AuthType = strings.TrimSpace(strings.ToLower(*input.AuthType))
		}
		if input.UserID != nil {
			config.UserID = strings.TrimSpace(*input.UserID)
		}
		if input.QuotaPerUnit != nil {
			config.QuotaPerUnit = *input.QuotaPerUnit
		}
		if input.AutoBalance != nil {
			config.AutoBalance = *input.AutoBalance
		}
		if input.AutoCheckin != nil {
			config.AutoCheckin = *input.AutoCheckin
		}
		if input.BalanceIntervalSeconds != nil {
			config.BalanceInterval = *input.BalanceIntervalSeconds
		}
		if input.CheckinIntervalSeconds != nil {
			config.CheckinInterval = *input.CheckinIntervalSeconds
		}
		if input.RetryMax != nil {
			config.RetryMax = *input.RetryMax
		} else if input.RetryMaxAttempts != nil {
			config.RetryMax = *input.RetryMaxAttempts
		}
		if input.RetryIntervalSeconds != nil {
			config.RetryInterval = *input.RetryIntervalSeconds
		}

		if input.ClearCredential {
			if input.Credential != nil && strings.TrimSpace(*input.Credential) != "" {
				return fmt.Errorf("%w: credential and clear_credential cannot be used together", ErrChannelCustomBalanceConfig)
			}
			config.EncryptedCredential = ""
		} else if input.Credential != nil && strings.TrimSpace(*input.Credential) != "" {
			if len([]rune(strings.TrimSpace(*input.Credential))) > ChannelCustomBalanceMaxCredentialLength {
				return fmt.Errorf("%w: credential is too long", ErrChannelCustomBalanceConfig)
			}
			encrypted, encryptErr := common.EncryptWithCryptoSecret(strings.TrimSpace(*input.Credential))
			if encryptErr != nil {
				return errors.New("failed to encrypt credential")
			}
			config.EncryptedCredential = encrypted
		}

		if err := ValidateChannelCustomBalanceConfig(&config); err != nil {
			return err
		}
		if err := validateChannelCustomBalanceChannel(channel, &config); err != nil {
			return err
		}
		if (config.Enabled || config.AutoBalance || config.AutoCheckin) && !config.UseChannelKey && config.EncryptedCredential == "" {
			return fmt.Errorf("%w: independent credential is required when use_channel_key is false", ErrChannelCustomBalanceConfig)
		}

		now := common.GetTimestamp()
		if !config.Enabled || !config.AutoBalance {
			config.NextBalanceAt = 0
		} else if isNew || !oldAutoBalance || config.NextBalanceAt == 0 {
			config.NextBalanceAt = now
		}
		if !config.Enabled || !config.AutoCheckin {
			config.NextCheckinAt = 0
		} else if isNew || !oldAutoCheckin || config.NextCheckinAt == 0 {
			config.NextCheckinAt = now
		}

		if err := model.DB.Save(&config).Error; err != nil {
			return err
		}
		view = channelCustomBalanceView(channel, &config)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return view, nil
}

func RefreshChannelCustomBalance(ctx context.Context, channelID int) (*ChannelCustomBalanceView, error) {
	view, _, err := runChannelCustomBalanceOperation(ctx, channelID, model.ChannelCustomBalanceOperationBalance, false)
	return view, err
}

func CheckinChannelCustomBalance(ctx context.Context, channelID int) (*ChannelCustomBalanceView, error) {
	view, _, err := runChannelCustomBalanceOperation(ctx, channelID, model.ChannelCustomBalanceOperationCheckin, false)
	return view, err
}

func BuildDueChannelCustomBalanceTask(taskType string, now int64) (*model.SystemTask, bool, error) {
	if !common.IsMasterNode {
		return nil, false, nil
	}
	operation, err := channelCustomBalanceOperationForTaskType(taskType)
	if err != nil {
		return nil, false, err
	}
	due, err := model.HasDueChannelCustomBalance(operation, now)
	if err != nil || !due {
		return nil, false, err
	}
	active, err := model.GetActiveSystemTask(taskType)
	if err != nil {
		return nil, false, err
	}
	if active != nil {
		return active, false, nil
	}
	task, err := model.CreateSystemTask(taskType, nil, nil)
	if err != nil {
		active, activeErr := model.GetActiveSystemTask(taskType)
		if activeErr == nil && active != nil {
			return active, false, nil
		}
		return nil, false, err
	}
	return task, true, nil
}

func RunDueChannelCustomBalanceTask(ctx context.Context, operation string) (ChannelCustomBalanceTaskSummary, error) {
	summary := ChannelCustomBalanceTaskSummary{Operation: operation}
	if ctx == nil {
		ctx = context.Background()
	}
	if operation != model.ChannelCustomBalanceOperationBalance && operation != model.ChannelCustomBalanceOperationCheckin {
		return summary, errors.New("invalid channel custom balance operation")
	}
	configs, err := model.ListDueChannelCustomBalances(operation, common.GetTimestamp())
	if err != nil {
		return summary, err
	}
	for _, config := range configs {
		if err := ctx.Err(); err != nil {
			return summary, err
		}
		summary.Processed++
		_, attempted, runErr := runChannelCustomBalanceOperation(ctx, config.ChannelID, operation, true)
		if !attempted {
			summary.Skipped++
			continue
		}
		if runErr != nil {
			summary.Failed++
		} else {
			summary.Succeeded++
		}
	}
	return summary, nil
}

func runChannelCustomBalanceOperation(ctx context.Context, channelID int, operation string, scheduled bool) (*ChannelCustomBalanceView, bool, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	var view *ChannelCustomBalanceView
	attempted := false
	var operationErr error
	err := withChannelCustomBalanceLease(ctx, channelID, func() error {
		channel, err := model.GetChannelById(channelID, true)
		if err != nil {
			operationErr = err
			return nil
		}
		config, err := model.GetChannelCustomBalance(channelID)
		if err != nil {
			operationErr = err
			return nil
		}
		if config == nil {
			operationErr = ErrChannelCustomBalanceNotConfigured
			defaultConfig := defaultChannelCustomBalanceConfig(channelID)
			view = channelCustomBalanceView(channel, &defaultConfig)
			return nil
		}
		normalizeStoredChannelCustomBalanceConfig(config)
		if err := ValidateChannelCustomBalanceConfig(config); err != nil {
			operationErr = err
			view = channelCustomBalanceView(channel, config)
			return nil
		}
		if err := validateChannelCustomBalanceChannel(channel, config); err != nil {
			attempted = true
			operationErr = err
			view = channelCustomBalanceView(channel, config)
			return nil
		}
		if scheduled && (!config.Enabled || !scheduledOperationEnabled(config, operation)) {
			view = channelCustomBalanceView(channel, config)
			return nil
		}
		attempted = true

		credential, err := channelCustomBalanceCredential(channel, config)
		if err == nil {
			provider, providerErr := channelCustomBalanceProviderFor(config.Provider)
			if providerErr != nil {
				err = providerErr
			} else if operation == model.ChannelCustomBalanceOperationBalance {
				var result channelCustomBalanceResult
				result, err = provider.FetchBalance(ctx, channel, config, credential)
				if err == nil && result.Balance != nil {
					if updateErr := channel.UpdateBalanceWithError(*result.Balance); updateErr != nil {
						err = updateErr
					}
				}
				if err == nil {
					err = recordChannelCustomBalanceSuccess(config, operation, result)
				}
			} else {
				var result channelCustomBalanceResult
				result, err = provider.Checkin(ctx, channel, config, credential)
				if err == nil {
					// A successful check-in can change the upstream quota. Refresh the
					// same balance endpoint used by manual/scheduled balance updates,
					// but keep the check-in successful if that best-effort refresh fails.
					if balanceResult, balanceErr := provider.FetchBalance(ctx, channel, config, credential); balanceErr == nil {
						if balanceResult.Balance != nil {
							_ = channel.UpdateBalanceWithError(*balanceResult.Balance)
						}
						if result.UserID == "" {
							result.UserID = balanceResult.UserID
						}
					}
					err = recordChannelCustomBalanceSuccess(config, operation, result)
				}
			}
		}
		if err != nil {
			if ctx.Err() != nil {
				operationErr = ctx.Err()
				return nil
			}
			safeErr := safeChannelCustomBalanceError(err, credential)
			if recordErr := recordChannelCustomBalanceFailure(config, operation, safeErr); recordErr != nil {
				operationErr = recordErr
			} else {
				operationErr = errors.New(safeErr)
			}
		}
		updated, viewErr := GetChannelCustomBalanceView(channelID)
		if viewErr == nil {
			view = updated
		}
		return nil
	})
	if err != nil {
		return nil, attempted, err
	}
	return view, attempted, operationErr
}

func withChannelCustomBalanceLease(ctx context.Context, channelID int, fn func() error) error {
	if channelID <= 0 {
		return errors.New("invalid channel id")
	}
	if ctx == nil {
		ctx = context.Background()
	}
	lockValue, _ := channelCustomBalanceLocks.LoadOrStore(channelID, &sync.Mutex{})
	lock := lockValue.(*sync.Mutex)
	lock.Lock()
	defer lock.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}
	holder := fmt.Sprintf("%s-custom-balance-%d-%s", common.NodeName, channelID, common.GetRandomString(8))
	leaseName := fmt.Sprintf("channel-custom-balance:%d", channelID)
	now := common.GetTimestamp()
	acquired, err := model.AcquireNamedLease(leaseName, holder, now, now+int64(channelCustomBalanceLeaseTTL/time.Second))
	if err != nil {
		return err
	}
	if !acquired {
		return ErrChannelCustomBalanceBusy
	}
	defer func() { _, _ = model.ReleaseNamedLease(leaseName, holder) }()
	return fn()
}

func defaultChannelCustomBalanceConfig(channelID int) model.ChannelCustomBalance {
	return model.ChannelCustomBalance{
		ChannelID:       channelID,
		Provider:        ChannelCustomBalanceProviderNewAPI,
		UseChannelKey:   true,
		AuthType:        ChannelCustomBalanceAuthToken,
		QuotaPerUnit:    ChannelCustomBalanceDefaultQuotaPerUnit,
		BalanceInterval: ChannelCustomBalanceDefaultBalanceInterval,
		CheckinInterval: ChannelCustomBalanceDefaultCheckinInterval,
		RetryMax:        ChannelCustomBalanceDefaultRetryMax,
		RetryInterval:   ChannelCustomBalanceDefaultRetryInterval,
	}
}

func normalizeStoredChannelCustomBalanceConfig(config *model.ChannelCustomBalance) {
	if config.Provider == "" {
		config.Provider = ChannelCustomBalanceProviderNewAPI
	}
	if config.AuthType == "" {
		config.AuthType = ChannelCustomBalanceAuthToken
	}
	if config.QuotaPerUnit == 0 {
		config.QuotaPerUnit = ChannelCustomBalanceDefaultQuotaPerUnit
	}
	if config.BalanceInterval == 0 {
		config.BalanceInterval = ChannelCustomBalanceDefaultBalanceInterval
	}
	if config.CheckinInterval == 0 {
		config.CheckinInterval = ChannelCustomBalanceDefaultCheckinInterval
	}
	if config.RetryMax == 0 {
		config.RetryMax = ChannelCustomBalanceDefaultRetryMax
	}
	if config.RetryInterval == 0 {
		config.RetryInterval = ChannelCustomBalanceDefaultRetryInterval
	}
}

func channelCustomBalanceView(channel *model.Channel, config *model.ChannelCustomBalance) *ChannelCustomBalanceView {
	return &ChannelCustomBalanceView{
		ChannelID:              channel.Id,
		Enabled:                config.Enabled,
		Provider:               config.Provider,
		UseChannelKey:          config.UseChannelKey,
		AuthType:               config.AuthType,
		CredentialSet:          config.EncryptedCredential != "" || (config.UseChannelKey && strings.TrimSpace(channel.Key) != ""),
		UserID:                 config.UserID,
		QuotaPerUnit:           config.QuotaPerUnit,
		AutoBalance:            config.AutoBalance,
		AutoCheckin:            config.AutoCheckin,
		BalanceIntervalSeconds: config.BalanceInterval,
		CheckinIntervalSeconds: config.CheckinInterval,
		RetryMax:               config.RetryMax,
		RetryMaxAttempts:       config.RetryMax,
		RetryIntervalSeconds:   config.RetryInterval,
		NextBalanceAt:          config.NextBalanceAt,
		NextCheckinAt:          config.NextCheckinAt,
		LastBalanceAt:          config.LastBalanceAt,
		LastCheckinAt:          config.LastCheckinAt,
		LastBalanceStatus:      config.LastBalanceStatus,
		LastBalanceError:       config.LastBalanceError,
		LastBalanceMessage:     config.LastBalanceMessage,
		LastCheckinStatus:      config.LastCheckinStatus,
		LastCheckinError:       config.LastCheckinError,
		LastCheckinMessage:     config.LastCheckinMessage,
		Balance:                channel.Balance,
		BalanceUpdatedTime:     channel.BalanceUpdatedTime,
	}
}

func channelCustomBalanceOperationForTaskType(taskType string) (string, error) {
	switch taskType {
	case model.SystemTaskTypeChannelCustomBalance:
		return model.ChannelCustomBalanceOperationBalance, nil
	case model.SystemTaskTypeChannelCustomCheckin:
		return model.ChannelCustomBalanceOperationCheckin, nil
	default:
		return "", errors.New("invalid channel custom balance task type")
	}
}

func scheduledOperationEnabled(config *model.ChannelCustomBalance, operation string) bool {
	if operation == model.ChannelCustomBalanceOperationBalance {
		return config.AutoBalance
	}
	return config.AutoCheckin
}

func channelCustomBalanceProviderFor(provider string) (channelCustomBalanceProvider, error) {
	if !isSupportedChannelCustomBalanceProvider(provider) {
		return nil, errors.New("unsupported channel custom balance provider")
	}
	return newAPICompatibleProvider{}, nil
}

func isSupportedChannelCustomBalanceProvider(provider string) bool {
	switch provider {
	case ChannelCustomBalanceProviderNewAPI,
		ChannelCustomBalanceProviderOneAPI,
		ChannelCustomBalanceProviderVeloera,
		ChannelCustomBalanceProviderAnyRouter:
		return true
	default:
		return false
	}
}

func channelCustomBalanceCredential(channel *model.Channel, config *model.ChannelCustomBalance) (string, error) {
	if config.UseChannelKey {
		if err := validateChannelCustomBalanceChannel(channel, config); err != nil {
			return "", err
		}
		credential := strings.TrimSpace(channel.Key)
		if credential == "" {
			return "", errors.New("channel key is empty")
		}
		return credential, nil
	}
	if config.EncryptedCredential == "" {
		return "", errors.New("independent credential is not configured")
	}
	credential, err := common.DecryptWithCryptoSecret(config.EncryptedCredential)
	if err != nil || strings.TrimSpace(credential) == "" {
		return "", errors.New("independent credential cannot be decrypted")
	}
	return strings.TrimSpace(credential), nil
}

func validateChannelCustomBalanceChannel(channel *model.Channel, config *model.ChannelCustomBalance) error {
	if channel != nil && config != nil && config.UseChannelKey && channel.ChannelInfo.IsMultiKey {
		return fmt.Errorf("%w: use_channel_key is not supported for multi-key channels", ErrChannelCustomBalanceConfig)
	}
	return nil
}

func normalizeChannelCustomBalanceBaseURL(rawURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || parsed == nil || parsed.Host == "" {
		return "", errors.New("channel base URL is invalid")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("channel base URL must use http or https")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("channel base URL must not contain credentials, query, or fragment")
	}
	path := strings.TrimRight(parsed.Path, "/")
	if strings.HasSuffix(strings.ToLower(path), "/v1") {
		path = strings.TrimRight(path[:len(path)-len("/v1")], "/")
	}
	parsed.Path = path
	parsed.RawPath = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func doChannelCustomBalanceRequest(ctx context.Context, channel *model.Channel, config *model.ChannelCustomBalance, credential, method, endpoint string) (int, []byte, error) {
	baseURL, err := normalizeChannelCustomBalanceBaseURL(channel.GetBaseURL())
	if err != nil {
		return 0, nil, err
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+endpoint, nil)
	if err != nil {
		return 0, nil, errors.New("failed to create channel balance request")
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "new-api-channel-custom-balance/1.0")
	if config.AuthType == ChannelCustomBalanceAuthCookie {
		req.Header.Set("Cookie", credential)
	} else {
		req.Header.Set("Authorization", "Bearer "+credential)
	}
	setChannelCustomBalanceUserHeader(req, config)
	baseClient, err := GetHttpClientWithProxy(channel.GetSetting().Proxy)
	if err != nil {
		return 0, nil, errors.New("failed to create channel balance HTTP client")
	}
	client := &http.Client{
		Transport: baseClient.Transport,
		Timeout:   channelCustomBalanceHTTPTimeout,
		CheckRedirect: func(req *http.Request, _ []*http.Request) error {
			if req.URL == nil || (req.URL.Scheme != "http" && req.URL.Scheme != "https") {
				return errors.New("unsafe redirect rejected")
			}
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, channelCustomBalanceMaxResponseBytes+1))
	if err != nil {
		return response.StatusCode, nil, errors.New("failed to read channel balance response")
	}
	if len(body) > channelCustomBalanceMaxResponseBytes {
		return response.StatusCode, nil, errors.New("channel balance response is too large")
	}
	return response.StatusCode, body, nil
}

func setChannelCustomBalanceUserHeader(req *http.Request, config *model.ChannelCustomBalance) {
	if req == nil || config == nil {
		return
	}
	userID := strings.TrimSpace(config.UserID)
	if userID == "" {
		return
	}
	switch config.Provider {
	case ChannelCustomBalanceProviderNewAPI, ChannelCustomBalanceProviderOneAPI:
		req.Header.Set("New-Api-User", userID)
	case ChannelCustomBalanceProviderVeloera:
		req.Header.Set("Veloera-User", userID)
	case ChannelCustomBalanceProviderAnyRouter:
		req.Header.Set("X-Requested-With", "XMLHttpRequest")
	}
}

func parseChannelCustomBalanceResponse(body []byte, quotaPerUnit float64) (float64, string, string, error) {
	var payload any
	if err := common.Unmarshal(body, &payload); err != nil {
		return 0, "", "", errors.New("invalid balance response")
	}
	quota, ok := findChannelCustomBalanceNumber(payload, []string{"remain_quota", "remaining_quota", "quota", "balance"})
	if !ok || quota < 0 || math.IsNaN(quota) || math.IsInf(quota, 0) || quota > ChannelCustomBalanceMaxQuotaValue {
		return 0, "", "", errors.New("balance response does not contain a valid quota")
	}
	if quotaPerUnit <= 0 || math.IsNaN(quotaPerUnit) || math.IsInf(quotaPerUnit, 0) {
		return 0, "", "", errors.New("quota_per_unit is invalid")
	}
	balance := quota / quotaPerUnit
	if balance < 0 || math.IsNaN(balance) || math.IsInf(balance, 0) || balance > ChannelCustomBalanceMaxBalance {
		return 0, "", "", errors.New("balance value is outside the allowed range")
	}
	return balance, parseChannelCustomBalanceMessage(body), findChannelCustomBalanceUserID(payload), nil
}

func findChannelCustomBalanceNumber(value any, names []string) (float64, bool) {
	for _, name := range names {
		if number, ok := findChannelCustomBalanceNumberByName(value, name); ok {
			return number, true
		}
	}
	return 0, false
}

func findChannelCustomBalanceNumberByName(value any, name string) (float64, bool) {
	if object, ok := value.(map[string]any); ok {
		for key, candidate := range object {
			if strings.EqualFold(key, name) {
				if number, ok := channelCustomBalanceNumber(candidate); ok {
					return number, true
				}
			}
		}
		for _, candidate := range object {
			if number, ok := findChannelCustomBalanceNumberByName(candidate, name); ok {
				return number, true
			}
		}
	}
	if array, ok := value.([]any); ok {
		for _, candidate := range array {
			if number, ok := findChannelCustomBalanceNumberByName(candidate, name); ok {
				return number, true
			}
		}
	}
	return 0, false
}

func channelCustomBalanceNumber(value any) (float64, bool) {
	switch typed := value.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		number, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		return number, err == nil
	default:
		return 0, false
	}
}

func findChannelCustomBalanceUserID(value any) string {
	if object, ok := value.(map[string]any); ok {
		for _, name := range []string{"user_id", "userId", "id"} {
			for key, candidate := range object {
				if strings.EqualFold(key, name) {
					if value := channelCustomBalanceString(candidate); value != "" {
						return value
					}
				}
			}
		}
		for _, candidate := range object {
			if value := findChannelCustomBalanceUserID(candidate); value != "" {
				return value
			}
		}
	}
	if array, ok := value.([]any); ok {
		for _, candidate := range array {
			if value := findChannelCustomBalanceUserID(candidate); value != "" {
				return value
			}
		}
	}
	return ""
}

func channelCustomBalanceString(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func parseChannelCustomBalanceMessage(body []byte) string {
	var payload any
	if err := common.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return findChannelCustomBalanceString(payload, []string{"message", "msg", "detail"})
}

func findChannelCustomBalanceString(value any, names []string) string {
	if object, ok := value.(map[string]any); ok {
		for _, name := range names {
			for key, candidate := range object {
				if strings.EqualFold(key, name) {
					if message := channelCustomBalanceString(candidate); message != "" {
						return message
					}
				}
			}
		}
		for _, candidate := range object {
			if message := findChannelCustomBalanceString(candidate, names); message != "" {
				return message
			}
		}
	}
	if array, ok := value.([]any); ok {
		for _, candidate := range array {
			if message := findChannelCustomBalanceString(candidate, names); message != "" {
				return message
			}
		}
	}
	return ""
}

func isAlreadyCheckedInResponse(body []byte) bool {
	message := strings.ToLower(string(body))
	for _, phrase := range []string{"今日已签到", "今天已签到", "已经签到", "今天已经签到", "已签到", "already checked in", "already check-in", "already checked-in", "already signed in", "checkin today"} {
		if strings.Contains(message, strings.ToLower(phrase)) {
			return true
		}
	}
	return false
}

func channelCustomBalanceResponseFailure(body []byte) (bool, string) {
	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return false, ""
	}
	success, ok := payload["success"].(bool)
	if !ok || success {
		return false, ""
	}
	return true, parseChannelCustomBalanceMessage(body)
}

func safeChannelCustomBalanceMessage(message, credential string) string {
	if credential != "" {
		message = strings.ReplaceAll(message, credential, "[redacted]")
	}
	message = strings.TrimSpace(message)
	if len(message) > 512 {
		return message[:512]
	}
	return message
}

func safeChannelCustomBalanceError(err error, credential string) string {
	if err == nil {
		return ""
	}
	message := safeChannelCustomBalanceMessage(err.Error(), credential)
	if message == "" {
		return "channel custom balance operation failed"
	}
	return message
}

func recordChannelCustomBalanceSuccess(config *model.ChannelCustomBalance, operation string, result channelCustomBalanceResult) error {
	now := common.GetTimestamp()
	updates := map[string]any{"updated_at": now}
	if operation == model.ChannelCustomBalanceOperationBalance {
		updates["last_balance_at"] = now
		updates["last_balance_status"] = "success"
		updates["last_balance_error"] = ""
		updates["last_balance_message"] = result.Message
		updates["balance_retry_count"] = 0
		if config.AutoBalance {
			updates["next_balance_at"] = now + config.BalanceInterval
		} else {
			updates["next_balance_at"] = 0
		}
	} else {
		updates["last_checkin_at"] = now
		updates["last_checkin_status"] = "success"
		updates["last_checkin_error"] = ""
		updates["last_checkin_message"] = result.Message
		updates["checkin_retry_count"] = 0
		if config.AutoCheckin {
			updates["next_checkin_at"] = now + config.CheckinInterval
		} else {
			updates["next_checkin_at"] = 0
		}
	}
	if config.UserID == "" && result.UserID != "" && !strings.ContainsAny(result.UserID, "\r\n") && len([]rune(result.UserID)) <= ChannelCustomBalanceMaxUserIDLength {
		updates["user_id"] = result.UserID
	}
	return model.DB.Model(&model.ChannelCustomBalance{}).Where("channel_id = ?", config.ChannelID).Updates(updates).Error
}

func recordChannelCustomBalanceFailure(config *model.ChannelCustomBalance, operation, errorMessage string) error {
	now := common.GetTimestamp()
	updates := map[string]any{"updated_at": now}
	if operation == model.ChannelCustomBalanceOperationBalance {
		retryCount := config.BalanceRetryCount + 1
		updates["last_balance_at"] = now
		updates["last_balance_error"] = errorMessage
		updates["last_balance_message"] = ""
		if !config.AutoBalance {
			updates["balance_retry_count"] = 0
			updates["last_balance_status"] = "failed"
			updates["next_balance_at"] = 0
		} else if retryCount <= config.RetryMax {
			updates["balance_retry_count"] = retryCount
			updates["last_balance_status"] = "retrying"
			updates["next_balance_at"] = now + config.RetryInterval
		} else {
			updates["balance_retry_count"] = 0
			updates["last_balance_status"] = "failed"
			updates["next_balance_at"] = now + config.BalanceInterval
		}
	} else {
		retryCount := config.CheckinRetryCount + 1
		updates["last_checkin_at"] = now
		updates["last_checkin_error"] = errorMessage
		updates["last_checkin_message"] = ""
		if !config.AutoCheckin {
			updates["checkin_retry_count"] = 0
			updates["last_checkin_status"] = "failed"
			updates["next_checkin_at"] = 0
		} else if retryCount <= config.RetryMax {
			updates["checkin_retry_count"] = retryCount
			updates["last_checkin_status"] = "retrying"
			updates["next_checkin_at"] = now + config.RetryInterval
		} else {
			updates["checkin_retry_count"] = 0
			updates["last_checkin_status"] = "failed"
			updates["next_checkin_at"] = now + config.CheckinInterval
		}
	}
	return model.DB.Model(&model.ChannelCustomBalance{}).Where("channel_id = ?", config.ChannelID).Updates(updates).Error
}
