package service

import (
	"errors"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupRequestGuardDB(t *testing.T) {
	t.Helper()
	usePricingPatchDB(t)
	sqlDB, err := model.DB.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, model.DB.AutoMigrate(&model.AutoPriceGuard{}))
}

func createRequestGuard(t *testing.T, channelID int, state model.AutoPriceGuardState) *model.Channel {
	t.Helper()
	guard := &model.AutoPriceGuard{ChannelID: channelID, State: state, Source: `{"key":"never-log"}`}
	require.NoError(t, model.DB.Create(guard).Error)
	return &model.Channel{Id: channelID, AutoPriceGuardID: guard.ID}
}

func TestAuthorizeChannelForUserRequestPolicy(t *testing.T) {
	setupRequestGuardDB(t)
	require.NoError(t, AuthorizeChannelForUserRequest(&model.Channel{Id: 1}))
	for _, state := range []model.AutoPriceGuardState{model.AutoPriceGuardStateUsed, model.AutoPriceGuardStateInvalidated, model.AutoPriceGuardStateResolved} {
		require.NoError(t, AuthorizeChannelForUserRequest(createRequestGuard(t, 2, state)))
	}
	for _, state := range []model.AutoPriceGuardState{model.AutoPriceGuardStateDeleting, model.AutoPriceGuardStateDeleted, model.AutoPriceGuardState("unknown")} {
		err := AuthorizeChannelForUserRequest(createRequestGuard(t, 3, state))
		require.ErrorIs(t, err, ErrChannelRequestGuardRejected)
		require.NotContains(t, err.Error(), "never-log")
		require.NotNil(t, ChannelRequestGuardCause(err))
	}
	missing := &model.Channel{Id: 4, AutoPriceGuardID: 999999}
	require.ErrorIs(t, AuthorizeChannelForUserRequest(missing), ErrChannelRequestGuardRejected)
	ownerMismatch := createRequestGuard(t, 5, model.AutoPriceGuardStatePending)
	ownerMismatch.Id = 6
	require.ErrorIs(t, AuthorizeChannelForUserRequest(ownerMismatch), ErrChannelRequestGuardRejected)
}

func TestRequestGuardRequestDeleteRaceAndStaleTombstone(t *testing.T) {
	setupRequestGuardDB(t)
	channel := createRequestGuard(t, 10, model.AutoPriceGuardStatePending)
	require.NoError(t, AuthorizeChannelForUserRequest(channel))
	result, err := model.DeleteAutoPriceGuardCAS(channel.AutoPriceGuardID)
	require.NoError(t, err)
	require.False(t, result.Transitioned)
	require.NoError(t, AuthorizeChannelForUserRequest(channel))

	deleting := createRequestGuard(t, 11, model.AutoPriceGuardStatePending)
	result, err = model.DeleteAutoPriceGuardCAS(deleting.AutoPriceGuardID)
	require.NoError(t, err)
	require.True(t, result.Transitioned)
	require.ErrorIs(t, AuthorizeChannelForUserRequest(deleting), ErrChannelRequestGuardRejected)
	require.True(t, func() bool {
		ok, _ := model.UpdateAutoPriceGuardTerminal(deleting.AutoPriceGuardID, model.AutoPriceGuardStateDeleted, "done")
		return ok
	}())
	require.ErrorIs(t, AuthorizeChannelForUserRequest(deleting), ErrChannelRequestGuardRejected)
}

func TestRequestGuardConcurrentAuthorizationAllowsUsedState(t *testing.T) {
	setupRequestGuardDB(t)
	channel := createRequestGuard(t, 20, model.AutoPriceGuardStatePending)
	var wg sync.WaitGroup
	errs := make(chan error, 2)
	for range 2 {
		wg.Add(1)
		go func() { defer wg.Done(); errs <- AuthorizeChannelForUserRequest(channel) }()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	guard, err := model.GetAutoPriceGuard(channel.AutoPriceGuardID)
	require.NoError(t, err)
	require.Equal(t, model.AutoPriceGuardStateUsed, guard.State)
}

func TestRequestGuardDatabaseErrorFailsClosed(t *testing.T) {
	setupRequestGuardDB(t)
	channel := createRequestGuard(t, 30, model.AutoPriceGuardStatePending)
	require.NoError(t, model.DB.Migrator().DropTable(&model.AutoPriceGuard{}))
	err := AuthorizeChannelForUserRequest(channel)
	require.True(t, IsChannelRequestGuardRejected(err))
	require.NotNil(t, ChannelRequestGuardCause(err))
	require.False(t, errors.Is(err, model.ErrPricingOptionIntegrity))
}

func TestRequestSelectorSkipsRejectedGuardAndFallsBackPriority(t *testing.T) {
	setupRequestGuardDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.Ability{}))
	previousCache := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = previousCache })
	high, low := int64(10), int64(1)
	guard := &model.AutoPriceGuard{ChannelID: 101, State: model.AutoPriceGuardStateDeleting}
	require.NoError(t, model.DB.Create(guard).Error)
	channels := []*model.Channel{{Id: 101, Status: common.ChannelStatusEnabled, AutoPriceGuardID: guard.ID}, {Id: 102, Status: common.ChannelStatusEnabled}, {Id: 103, Status: common.ChannelStatusEnabled}}
	for _, channel := range channels {
		require.NoError(t, model.DB.Create(channel).Error)
	}
	abilities := []model.Ability{{Group: "g", Model: "m", ChannelId: 101, Enabled: true, Priority: &high, Weight: 1}, {Group: "g", Model: "m", ChannelId: 102, Enabled: true, Priority: &high, Weight: 1}, {Group: "g", Model: "m", ChannelId: 103, Enabled: true, Priority: &low, Weight: 1}}
	require.NoError(t, model.DB.Create(&abilities).Error)
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	param := &RetryParam{Ctx: context, TokenGroup: "g", ModelName: "m", RequestPath: "", Retry: common.GetPointer(0)}
	channel, _, err := CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.Equal(t, 102, channel.Id)
	require.NoError(t, model.DB.Model(&model.Channel{}).Where("id = ?", 102).Update("auto_price_guard_id", guard.ID).Error)
	// The selector rereads the channel from DB and now must fall through to low priority.
	channel, _, err = CacheGetRandomSatisfiedChannel(param)
	require.NoError(t, err)
	require.Equal(t, 103, channel.Id)
}
