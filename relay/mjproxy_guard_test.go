package relay

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useMJGuardTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := model.DB
	previousCache := common.MemoryCacheEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Midjourney{}, &model.Channel{}, &model.AutoPriceGuard{}))
	model.DB = db
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		model.DB = previousDB
		common.MemoryCacheEnabled = previousCache
	})
	return db
}

func TestRelayMidjourneyImageMissingChannelDoesNotFetch(t *testing.T) {
	db := useMJGuardTestDB(t)
	requests := 0
	imageServer := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests++ }))
	t.Cleanup(imageServer.Close)
	require.NoError(t, db.Create(&model.Midjourney{MjId: "missing", ChannelId: 404, ImageUrl: imageServer.URL}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "missing"}}
	RelayMidjourneyImage(ctx)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Zero(t, requests)
	require.NotContains(t, recorder.Body.String(), imageServer.URL)
}

func TestRelayMidjourneyImageDeletingGuardDoesNotFetch(t *testing.T) {
	db := useMJGuardTestDB(t)
	requests := 0
	imageServer := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests++ }))
	t.Cleanup(imageServer.Close)
	guard := &model.AutoPriceGuard{ChannelID: 7, State: model.AutoPriceGuardStateDeleting}
	require.NoError(t, db.Create(guard).Error)
	require.NoError(t, db.Create(&model.Channel{Id: 7, Status: common.ChannelStatusEnabled, AutoPriceGuardID: guard.ID}).Error)
	require.NoError(t, db.Create(&model.Midjourney{MjId: "deleting", ChannelId: 7, ImageUrl: imageServer.URL}).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "deleting"}}
	RelayMidjourneyImage(ctx)

	require.Equal(t, http.StatusServiceUnavailable, recorder.Code)
	require.Zero(t, requests)
	require.NotContains(t, recorder.Body.String(), imageServer.URL)
}
