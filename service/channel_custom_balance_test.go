package service

import (
	"context"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelCustomBalanceServiceDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousSecret := common.CryptoSecret
	previousNode := common.NodeName
	previousMaster := common.IsMasterNode
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.ChannelCustomBalance{}, &model.NamedLease{}, &model.SystemTask{}, &model.SystemTaskLock{}))
	model.DB = db
	common.CryptoSecret = "channel-custom-balance-test-secret"
	common.NodeName = "test-node"
	common.IsMasterNode = true
	t.Cleanup(func() {
		model.DB = previousDB
		common.CryptoSecret = previousSecret
		common.NodeName = previousNode
		common.IsMasterNode = previousMaster
		_ = sqlDB.Close()
	})
	return db
}

func customBalanceChannel(t *testing.T, db *gorm.DB, baseURL, key string) *model.Channel {
	t.Helper()
	channel := &model.Channel{Key: key, BaseURL: &baseURL, Name: "custom-balance-test"}
	require.NoError(t, db.Create(channel).Error)
	return channel
}

func TestChannelCustomBalanceTokenCookieAndBalanceUpdate(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	var balanceRequests, checkinRequests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/user/self":
			atomic.AddInt32(&balanceRequests, 1)
			assert.Equal(t, "Bearer channel-key-secret", r.Header.Get("Authorization"))
			assert.Empty(t, r.Header.Get("Cookie"))
			_, _ = w.Write([]byte(`{"data":{"remain_quota":1000000,"user_id":"user-42"}}`))
		case "/api/user/checkin":
			atomic.AddInt32(&checkinRequests, 1)
			assert.Equal(t, "Bearer channel-key-secret", r.Header.Get("Authorization"))
			assert.Equal(t, "application/json", r.Header.Get("Content-Type"))
			body, readErr := io.ReadAll(r.Body)
			assert.NoError(t, readErr)
			assert.JSONEq(t, `{}`, string(body))
			_, _ = w.Write([]byte(`{"success":false,"message":"今日已签到"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL+"/v1/", "channel-key-secret")
	enabled := true
	useChannelKey := true
	autoBalance := false
	autoCheckin := false
	view, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:       &enabled,
		UseChannelKey: &useChannelKey,
		AutoBalance:   &autoBalance,
		AutoCheckin:   &autoCheckin,
	})
	require.NoError(t, err)
	require.True(t, view.CredentialSet)

	view, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
	require.NoError(t, err)
	assert.Equal(t, float64(2), view.Balance)
	assert.Equal(t, "user-42", view.UserID)
	assert.Equal(t, "success", view.LastBalanceStatus)
	assert.Equal(t, int32(1), atomic.LoadInt32(&balanceRequests))

	var storedChannel model.Channel
	require.NoError(t, db.First(&storedChannel, channel.Id).Error)
	assert.Equal(t, float64(2), storedChannel.Balance)
	assert.NotZero(t, storedChannel.BalanceUpdatedTime)

	view, err = CheckinChannelCustomBalance(context.Background(), channel.Id)
	require.NoError(t, err)
	assert.Equal(t, "success", view.LastCheckinStatus)
	assert.Equal(t, int32(1), atomic.LoadInt32(&checkinRequests))
	assert.Equal(t, int32(2), atomic.LoadInt32(&balanceRequests))

	credential := "session-cookie-secret"
	useIndependentCredential := false
	authType := ChannelCustomBalanceAuthCookie
	view, err = UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		UseChannelKey: &useIndependentCredential,
		AuthType:      &authType,
		Credential:    &credential,
	})
	require.NoError(t, err)
	assert.True(t, view.CredentialSet)

	var encrypted model.ChannelCustomBalance
	require.NoError(t, db.First(&encrypted, "channel_id = ?", channel.Id).Error)
	assert.NotEqual(t, credential, encrypted.EncryptedCredential)
	decrypted, err := common.DecryptWithCryptoSecret(encrypted.EncryptedCredential)
	require.NoError(t, err)
	assert.Equal(t, credential, decrypted)

	server.Config.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, credential, r.Header.Get("Cookie"))
		assert.Empty(t, r.Header.Get("Authorization"))
		if r.URL.Path == "/api/user/self" {
			_, _ = w.Write([]byte(`{"quota":"500000"}`))
			return
		}
		_, _ = w.Write([]byte(`{"message":"ok"}`))
	})
	view, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
	require.NoError(t, err)
	assert.Equal(t, float64(1), view.Balance)
}

func TestChannelCustomBalanceProviderUserHeaders(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	expectedProvider := ChannelCustomBalanceProviderNewAPI
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch expectedProvider {
		case ChannelCustomBalanceProviderNewAPI, ChannelCustomBalanceProviderOneAPI:
			assert.Equal(t, "user-42", r.Header.Get("New-Api-User"))
			assert.Empty(t, r.Header.Get("Veloera-User"))
			assert.Empty(t, r.Header.Get("X-Requested-With"))
		case ChannelCustomBalanceProviderVeloera:
			assert.Equal(t, "user-42", r.Header.Get("Veloera-User"))
			assert.Empty(t, r.Header.Get("New-Api-User"))
			assert.Empty(t, r.Header.Get("X-Requested-With"))
		case ChannelCustomBalanceProviderAnyRouter:
			assert.Equal(t, "XMLHttpRequest", r.Header.Get("X-Requested-With"))
			assert.Empty(t, r.Header.Get("New-Api-User"))
			assert.Empty(t, r.Header.Get("Veloera-User"))
		}
		_, _ = w.Write([]byte(`{"quota":500000}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "channel-key")
	enabled := true
	useChannelKey := true
	userID := "user-42"
	for _, provider := range []string{
		ChannelCustomBalanceProviderNewAPI,
		ChannelCustomBalanceProviderOneAPI,
		ChannelCustomBalanceProviderVeloera,
		ChannelCustomBalanceProviderAnyRouter,
	} {
		expectedProvider = provider
		providerValue := provider
		_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
			Enabled:       &enabled,
			Provider:      &providerValue,
			UseChannelKey: &useChannelKey,
			UserID:        &userID,
		})
		require.NoError(t, err)
		_, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
		require.NoError(t, err)
	}
}

func TestChannelCustomBalanceCheckinUsesProviderEndpoint(t *testing.T) {
	for _, testCase := range []struct {
		provider string
		path     string
	}{
		{provider: ChannelCustomBalanceProviderNewAPI, path: "/api/user/checkin"},
		{provider: ChannelCustomBalanceProviderOneAPI, path: "/api/user/checkin"},
		{provider: ChannelCustomBalanceProviderVeloera, path: "/api/user/check_in"},
		{provider: ChannelCustomBalanceProviderAnyRouter, path: "/api/user/sign_in"},
	} {
		t.Run(testCase.provider, func(t *testing.T) {
			db := setupChannelCustomBalanceServiceDB(t)
			var checkinPath string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/user/self" {
					checkinPath = r.URL.Path
				}
				w.WriteHeader(http.StatusOK)
				if r.URL.Path == "/api/user/self" {
					_, _ = w.Write([]byte(`{"quota":500000}`))
					return
				}
				_, _ = w.Write([]byte(`{"message":"ok"}`))
			}))
			defer server.Close()

			channel := customBalanceChannel(t, db, server.URL, "channel-key")
			enabled, provider := true, testCase.provider
			useChannelKey := true
			_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
				Enabled:       &enabled,
				Provider:      &provider,
				UseChannelKey: &useChannelKey,
			})
			require.NoError(t, err)
			_, err = CheckinChannelCustomBalance(context.Background(), channel.Id)
			require.NoError(t, err)
			assert.Equal(t, testCase.path, checkinPath)
		})
	}
}

func TestChannelCustomBalanceCheckinRejectsFailedJSONPayload(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"success":false,"message":"temporary upstream failure"}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "channel-key")
	enabled := true
	useChannelKey := true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{Enabled: &enabled, UseChannelKey: &useChannelKey})
	require.NoError(t, err)

	_, err = CheckinChannelCustomBalance(context.Background(), channel.Id)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "temporary upstream failure")
	var config model.ChannelCustomBalance
	require.NoError(t, db.First(&config, "channel_id = ?", channel.Id).Error)
	assert.Equal(t, "failed", config.LastCheckinStatus)
}

func TestChannelCustomBalanceRefreshRejectsFailedJSONPayload(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"success":false,"message":"未登录，请先登录"}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "channel-key")
	enabled, useChannelKey := true, true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:       &enabled,
		UseChannelKey: &useChannelKey,
	})
	require.NoError(t, err)

	_, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "未登录，请先登录")
}

func TestChannelCustomBalanceRefreshExplainsUpstreamAuthenticationFailure(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"success":false,"message":"token invalid"}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "relay-token")
	enabled, useChannelKey := true, true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:       &enabled,
		UseChannelKey: &useChannelKey,
	})
	require.NoError(t, err)

	_, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "dashboard access token or Cookie")
}

func TestChannelCustomBalanceRejectsChannelKeyForMultiKeyChannel(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	baseURL := "http://127.0.0.1"
	channel := &model.Channel{
		Key:         "key-one\nkey-two",
		BaseURL:     &baseURL,
		Name:        "multi-key-custom-balance",
		ChannelInfo: model.ChannelInfo{IsMultiKey: true},
	}
	require.NoError(t, db.Create(channel).Error)

	enabled := false
	useChannelKey := true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{Enabled: &enabled, UseChannelKey: &useChannelKey})
	assert.ErrorIs(t, err, ErrChannelCustomBalanceConfig)
	assert.ErrorContains(t, err, "multi-key")

	config := &model.ChannelCustomBalance{
		ChannelID:       channel.Id,
		Enabled:         true,
		Provider:        ChannelCustomBalanceProviderNewAPI,
		UseChannelKey:   true,
		AuthType:        ChannelCustomBalanceAuthToken,
		QuotaPerUnit:    ChannelCustomBalanceDefaultQuotaPerUnit,
		BalanceInterval: 1,
		CheckinInterval: 1,
		RetryMax:        1,
		RetryInterval:   1,
	}
	require.NoError(t, db.Create(config).Error)
	_, err = RefreshChannelCustomBalance(context.Background(), channel.Id)
	assert.ErrorIs(t, err, ErrChannelCustomBalanceConfig)
	assert.ErrorContains(t, err, "multi-key")
}

func TestChannelCustomBalanceFailureRetriesWithoutOverwritingBalance(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&requests, 1)
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`{"message":"upstream failure"}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "key")
	require.NoError(t, db.Model(channel).Updates(map[string]any{"balance": 9.0}).Error)
	enabled, autoBalance := true, true
	useChannelKey := true
	retryMax, retryInterval, balanceInterval := 1, int64(1), int64(100)
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:                &enabled,
		UseChannelKey:          &useChannelKey,
		AutoBalance:            &autoBalance,
		RetryMax:               &retryMax,
		RetryIntervalSeconds:   &retryInterval,
		BalanceIntervalSeconds: &balanceInterval,
	})
	require.NoError(t, err)

	summary, err := RunDueChannelCustomBalanceTask(context.Background(), model.ChannelCustomBalanceOperationBalance)
	require.NoError(t, err)
	assert.Equal(t, 1, summary.Failed)

	var config model.ChannelCustomBalance
	require.NoError(t, db.First(&config, "channel_id = ?", channel.Id).Error)
	assert.Equal(t, "retrying", config.LastBalanceStatus)
	assert.Equal(t, 1, config.BalanceRetryCount)
	assert.Greater(t, config.NextBalanceAt, common.GetTimestamp())

	require.NoError(t, db.Model(&config).Update("next_balance_at", common.GetTimestamp()-1).Error)
	summary, err = RunDueChannelCustomBalanceTask(context.Background(), model.ChannelCustomBalanceOperationBalance)
	require.NoError(t, err)
	assert.Equal(t, 1, summary.Failed)
	require.NoError(t, db.First(&config, "channel_id = ?", channel.Id).Error)
	assert.Equal(t, "failed", config.LastBalanceStatus)
	assert.Zero(t, config.BalanceRetryCount)
	assert.Equal(t, float64(9), channelBalance(t, db, channel.Id))
	assert.Equal(t, int32(2), atomic.LoadInt32(&requests))
}

func TestChannelCustomBalanceDueTaskUsesSingletonActiveRow(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	channel := customBalanceChannel(t, db, "http://127.0.0.1", "key")
	enabled, autoBalance := true, true
	useChannelKey := true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:       &enabled,
		UseChannelKey: &useChannelKey,
		AutoBalance:   &autoBalance,
	})
	require.NoError(t, err)

	task, built, err := BuildDueChannelCustomBalanceTask(model.SystemTaskTypeChannelCustomBalance, common.GetTimestamp())
	require.NoError(t, err)
	require.True(t, built)
	require.NotNil(t, task)
	second, built, err := BuildDueChannelCustomBalanceTask(model.SystemTaskTypeChannelCustomBalance, common.GetTimestamp())
	require.NoError(t, err)
	assert.False(t, built)
	assert.Equal(t, task.TaskID, second.TaskID)
}

func TestChannelCustomBalanceOperationsSerializePerChannel(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	releaseFirst := make(chan struct{})
	firstStarted := make(chan struct{})
	var requests, active, maxActive int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		current := atomic.AddInt32(&active, 1)
		defer atomic.AddInt32(&active, -1)
		for {
			observed := atomic.LoadInt32(&maxActive)
			if current <= observed || atomic.CompareAndSwapInt32(&maxActive, observed, current) {
				break
			}
		}
		if atomic.AddInt32(&requests, 1) == 1 {
			close(firstStarted)
			<-releaseFirst
		}
		_, _ = w.Write([]byte(`{"quota":500000}`))
	}))
	defer server.Close()

	channel := customBalanceChannel(t, db, server.URL, "key")
	enabled := true
	useChannelKey := true
	_, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{Enabled: &enabled, UseChannelKey: &useChannelKey})
	require.NoError(t, err)

	results := make(chan error, 2)
	go func() {
		_, operationErr := RefreshChannelCustomBalance(context.Background(), channel.Id)
		results <- operationErr
	}()
	<-firstStarted
	go func() {
		_, operationErr := RefreshChannelCustomBalance(context.Background(), channel.Id)
		results <- operationErr
	}()
	assert.Equal(t, int32(1), atomic.LoadInt32(&requests))
	close(releaseFirst)
	require.NoError(t, <-results)
	require.NoError(t, <-results)
	assert.Equal(t, int32(2), atomic.LoadInt32(&requests))
	assert.Equal(t, int32(1), atomic.LoadInt32(&maxActive))
}

func TestChannelCustomBalanceCredentialIsNotReturnedAndEmptyPreserves(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	channel := customBalanceChannel(t, db, "http://127.0.0.1", "channel-key")
	credential := "independent-secret"
	useChannelKey := false
	enabled := false
	view, err := UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{
		Enabled:       &enabled,
		UseChannelKey: &useChannelKey,
		Credential:    &credential,
	})
	require.NoError(t, err)
	encoded, err := common.Marshal(view)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), credential)
	assert.NotContains(t, string(encoded), "EncryptedCredential")

	empty := ""
	_, err = UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{Credential: &empty})
	require.NoError(t, err)
	var config model.ChannelCustomBalance
	require.NoError(t, db.First(&config, "channel_id = ?", channel.Id).Error)
	decrypted, err := common.DecryptWithCryptoSecret(config.EncryptedCredential)
	require.NoError(t, err)
	assert.Equal(t, credential, decrypted)

	_, err = UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{ClearCredential: true})
	require.NoError(t, err)
	require.NoError(t, db.First(&config, "channel_id = ?", channel.Id).Error)
	assert.Empty(t, config.EncryptedCredential)
}

func TestChannelCustomBalanceConfigBoundsAndLease(t *testing.T) {
	db := setupChannelCustomBalanceServiceDB(t)
	channel := customBalanceChannel(t, db, "http://127.0.0.1", "key")
	valid := model.ChannelCustomBalance{
		Provider:        ChannelCustomBalanceProviderNewAPI,
		AuthType:        ChannelCustomBalanceAuthToken,
		QuotaPerUnit:    ChannelCustomBalanceDefaultQuotaPerUnit,
		BalanceInterval: 1,
		CheckinInterval: 1,
		RetryMax:        1,
		RetryInterval:   1,
	}
	require.NoError(t, ValidateChannelCustomBalanceConfig(&valid))
	for _, invalid := range []*model.ChannelCustomBalance{
		{Provider: "unknown", AuthType: ChannelCustomBalanceAuthToken, QuotaPerUnit: 1, BalanceInterval: 1, CheckinInterval: 1, RetryMax: 1, RetryInterval: 1},
		{Provider: ChannelCustomBalanceProviderNewAPI, AuthType: ChannelCustomBalanceAuthToken, QuotaPerUnit: math.NaN(), BalanceInterval: 1, CheckinInterval: 1, RetryMax: 1, RetryInterval: 1},
		{Provider: ChannelCustomBalanceProviderNewAPI, AuthType: ChannelCustomBalanceAuthToken, QuotaPerUnit: 1, BalanceInterval: 0, CheckinInterval: 1, RetryMax: 1, RetryInterval: 1},
		{Provider: ChannelCustomBalanceProviderNewAPI, AuthType: ChannelCustomBalanceAuthToken, QuotaPerUnit: 1, BalanceInterval: 1, CheckinInterval: 1, RetryMax: ChannelCustomBalanceMaxRetryMax + 1, RetryInterval: 1},
	} {
		assert.ErrorIs(t, ValidateChannelCustomBalanceConfig(invalid), ErrChannelCustomBalanceConfig)
	}

	now := common.GetTimestamp()
	ok, err := model.AcquireNamedLease("channel-custom-balance:"+strconv.Itoa(channel.Id), "other-node", now, now+60)
	require.NoError(t, err)
	require.True(t, ok)
	enabled := true
	useChannelKey := true
	_, err = UpdateChannelCustomBalanceConfig(context.Background(), channel.Id, ChannelCustomBalanceUpdate{Enabled: &enabled, UseChannelKey: &useChannelKey})
	assert.ErrorIs(t, err, ErrChannelCustomBalanceBusy)
	_, _ = model.ReleaseNamedLease("channel-custom-balance:"+strconv.Itoa(channel.Id), "other-node")
}

func channelBalance(t *testing.T, db *gorm.DB, channelID int) float64 {
	t.Helper()
	var channel model.Channel
	require.NoError(t, db.First(&channel, channelID).Error)
	return channel.Balance
}
