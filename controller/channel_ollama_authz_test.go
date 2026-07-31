package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type ollamaOperation struct {
	name    string
	handler gin.HandlerFunc
	request func(channelID int) *http.Request
}

var ollamaUserOperations = []ollamaOperation{
	{
		name: "pull", handler: OllamaPullModel,
		request: func(channelID int) *http.Request {
			return httptest.NewRequest(http.MethodPost, "/api/channel/ollama/pull", bytes.NewBufferString(fmt.Sprintf(`{"channel_id":%d,"model_name":"test-model"}`, channelID)))
		},
	},
	{
		name: "pull stream", handler: OllamaPullModelStream,
		request: func(channelID int) *http.Request {
			return httptest.NewRequest(http.MethodPost, "/api/channel/ollama/pull-stream", bytes.NewBufferString(fmt.Sprintf(`{"channel_id":%d,"model_name":"test-model"}`, channelID)))
		},
	},
	{
		name: "delete", handler: OllamaDeleteModel,
		request: func(channelID int) *http.Request {
			return httptest.NewRequest(http.MethodDelete, "/api/channel/ollama/delete", bytes.NewBufferString(fmt.Sprintf(`{"channel_id":%d,"model_name":"test-model"}`, channelID)))
		},
	},
	{
		name: "version", handler: OllamaVersion,
		request: func(channelID int) *http.Request {
			return httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/channel/%d/ollama/version", channelID), nil)
		},
	},
}

func invokeOllamaUserOperation(operation ollamaOperation, channelID int) *httptest.ResponseRecorder {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = operation.request(channelID)
	if operation.name == "version" {
		ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", channelID)}}
	}
	operation.handler(ctx)
	return recorder
}

func createOllamaGuardedChannel(t *testing.T, baseURL string, guardID int64) *model.Channel {
	t.Helper()
	channel := &model.Channel{
		Type:             constant.ChannelTypeOllama,
		Status:           common.ChannelStatusEnabled,
		Key:              "upstream-secret",
		BaseURL:          &baseURL,
		AutoPriceGuardID: guardID,
	}
	require.NoError(t, model.DB.Create(channel).Error)
	return channel
}

func TestOllamaUserOperationsAuthorizeRequestGuard(t *testing.T) {
	for _, operation := range ollamaUserOperations {
		t.Run(operation.name, func(t *testing.T) {
			for _, test := range []struct {
				name         string
				guardState   model.AutoPriceGuardState
				guardIDZero  bool
				wantUpstream bool
				wantStatus   int
			}{
				{name: "pending is consumed", guardState: model.AutoPriceGuardStatePending, wantUpstream: true, wantStatus: http.StatusOK},
				{name: "guard id zero", guardIDZero: true, wantUpstream: true, wantStatus: http.StatusOK},
				{name: "used accepted", guardState: model.AutoPriceGuardStateUsed, wantUpstream: true, wantStatus: http.StatusOK},
				{name: "invalidated accepted", guardState: model.AutoPriceGuardStateInvalidated, wantUpstream: true, wantStatus: http.StatusOK},
				{name: "resolved accepted", guardState: model.AutoPriceGuardStateResolved, wantUpstream: true, wantStatus: http.StatusOK},
				{name: "deleting rejected", guardState: model.AutoPriceGuardStateDeleting, wantStatus: http.StatusServiceUnavailable},
				{name: "deleted rejected", guardState: model.AutoPriceGuardStateDeleted, wantStatus: http.StatusServiceUnavailable},
			} {
				t.Run(test.name, func(t *testing.T) {
					db := setupModelListControllerTestDB(t)
					require.NoError(t, db.AutoMigrate(&model.AutoPriceGuard{}))
					upstreamCalls := 0
					upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						upstreamCalls++
						if operation.name == "pull stream" {
							_, _ = w.Write([]byte(`{"status":"success"}\n`))
						} else if operation.name == "version" {
							_, _ = w.Write([]byte(`{"version":"1.0.0"}`))
						}
					}))
					defer upstream.Close()

					var guardID int64
					if !test.guardIDZero {
						guard := &model.AutoPriceGuard{ChannelID: 1, State: test.guardState, Source: `{"key":"guard-secret"}`}
						require.NoError(t, db.Create(guard).Error)
						guardID = guard.ID
					}
					channel := createOllamaGuardedChannel(t, upstream.URL, guardID)
					if guardID != 0 {
						require.NoError(t, db.Model(&model.AutoPriceGuard{}).Where("id = ?", guardID).Update("channel_id", channel.Id).Error)
					}

					recorder := invokeOllamaUserOperation(operation, channel.Id)
					assert.Equal(t, test.wantStatus, recorder.Code)
					assert.Equal(t, test.wantUpstream, upstreamCalls > 0)
					if !test.wantUpstream {
						assert.NotContains(t, recorder.Body.String(), "upstream-secret")
						assert.NotContains(t, recorder.Body.String(), "guard-secret")
					}
					if test.guardState == model.AutoPriceGuardStatePending {
						var guard model.AutoPriceGuard
						require.NoError(t, db.First(&guard, guardID).Error)
						assert.Equal(t, model.AutoPriceGuardStateUsed, guard.State)
					}
				})
			}
		})
	}
}

func TestOllamaUserOperationsRejectMissingAndDatabaseGuard(t *testing.T) {
	for _, operation := range ollamaUserOperations {
		t.Run(operation.name, func(t *testing.T) {
			for _, test := range []struct {
				name      string
				dropTable bool
			}{
				{name: "missing guard"},
				{name: "guard database error", dropTable: true},
			} {
				t.Run(test.name, func(t *testing.T) {
					db := setupModelListControllerTestDB(t)
					require.NoError(t, db.AutoMigrate(&model.AutoPriceGuard{}))
					upstreamCalls := 0
					upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { upstreamCalls++ }))
					defer upstream.Close()
					channel := createOllamaGuardedChannel(t, upstream.URL, 987654)
					if test.dropTable {
						guard := &model.AutoPriceGuard{ChannelID: channel.Id, Source: `{"key":"guard-secret"}`}
						require.NoError(t, db.Create(guard).Error)
						require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("auto_price_guard_id", guard.ID).Error)
						require.NoError(t, db.Migrator().DropTable(&model.AutoPriceGuard{}))
					}

					recorder := invokeOllamaUserOperation(operation, channel.Id)
					assert.Equal(t, http.StatusServiceUnavailable, recorder.Code)
					assert.Zero(t, upstreamCalls)
					assert.NotContains(t, recorder.Body.String(), "upstream-secret")
					assert.NotContains(t, recorder.Body.String(), "guard-secret")
				})
			}
		})
	}
}
