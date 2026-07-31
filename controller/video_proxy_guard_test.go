package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

func TestGeminiVideoPrivateKeyAuthorizesChannelGuard(t *testing.T) {
	for _, state := range []model.AutoPriceGuardState{
		model.AutoPriceGuardStatePending,
		model.AutoPriceGuardStateDeleting,
		model.AutoPriceGuardStateDeleted,
	} {
		t.Run(string(state), func(t *testing.T) {
			db := setupModelListControllerTestDB(t)
			require.NoError(t, db.AutoMigrate(&model.AutoPriceGuard{}))
			guard := &model.AutoPriceGuard{ChannelID: 1, State: state, Source: `{"key":"guard-secret"}`}
			require.NoError(t, db.Create(guard).Error)
			channel := &model.Channel{Id: 1, Type: constant.ChannelTypeGemini, Status: common.ChannelStatusEnabled, AutoPriceGuardID: guard.ID}
			task := &model.Task{PrivateData: model.TaskPrivateData{Key: "private-secret"}, Data: []byte(`{"uri":"https://example.test/video"}`)}

			url, err := getGeminiVideoURL(channel, task, task.PrivateData.Key)
			if state == model.AutoPriceGuardStatePending {
				require.NoError(t, err)
				require.Equal(t, "https://example.test/video?key=private-secret", url)
				var stored model.AutoPriceGuard
				require.NoError(t, db.First(&stored, guard.ID).Error)
				require.Equal(t, model.AutoPriceGuardStateUsed, stored.State)
				return
			}
			require.ErrorIs(t, err, service.ErrChannelRequestGuardRejected)
			require.Empty(t, url)
			require.NotContains(t, err.Error(), "private-secret")
			require.NotContains(t, err.Error(), "guard-secret")
		})
	}
}

func TestGeminiVideoGuardIDZeroIsCompatible(t *testing.T) {
	channel := &model.Channel{Type: constant.ChannelTypeGemini}
	task := &model.Task{PrivateData: model.TaskPrivateData{Key: "private-secret"}, Data: []byte(`{"uri":"https://example.test/video"}`)}
	_, err := getGeminiVideoURL(channel, task, task.PrivateData.Key)
	require.NoError(t, err)
}
