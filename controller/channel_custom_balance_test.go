package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupChannelCustomBalanceControllerDB(t *testing.T) *model.Channel {
	t.Helper()
	db := usePricingControllerDB(t)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.ChannelCustomBalance{}, &model.NamedLease{}))
	key := "controller-channel-key"
	channel := &model.Channel{Key: key, Name: "controller-custom-balance"}
	require.NoError(t, db.Create(channel).Error)
	return channel
}

func TestChannelCustomBalanceAPIDoesNotReturnCredential(t *testing.T) {
	channel := setupChannelCustomBalanceControllerDB(t)
	requestBody := []byte(`{"enabled":false,"use_channel_key":false,"credential":"controller-secret"}`)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: strconv.Itoa(channel.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/channel/1/custom-balance", bytes.NewReader(requestBody))
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannelCustomBalance(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "controller-secret")
	assert.NotContains(t, recorder.Body.String(), "EncryptedCredential")
	assert.Contains(t, recorder.Body.String(), `"credential_set":true`)
	var stored model.ChannelCustomBalance
	require.NoError(t, model.DB.First(&stored, "channel_id = ?", channel.Id).Error)
	assert.NotContains(t, recorder.Body.String(), stored.EncryptedCredential)

	recorder = httptest.NewRecorder()
	ctx, _ = gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: intString(channel.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodGet, "/api/channel/1/custom-balance", nil)
	GetChannelCustomBalance(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "controller-secret")
}

func TestChannelCustomBalanceAPIRejectsInvalidQuota(t *testing.T) {
	channel := setupChannelCustomBalanceControllerDB(t)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: intString(channel.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/channel/1/custom-balance", bytes.NewBufferString(`{"quota_per_unit":0}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannelCustomBalance(ctx)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "quota_per_unit")
}

func TestChannelCustomBalanceAPIAcceptsNumericUserID(t *testing.T) {
	channel := setupChannelCustomBalanceControllerDB(t)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: intString(channel.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/channel/1/custom-balance", bytes.NewBufferString(`{"user_id":42}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannelCustomBalance(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"user_id":"42"`)
}

func TestChannelCustomBalanceAPIPreservesLargeNumericUserID(t *testing.T) {
	channel := setupChannelCustomBalanceControllerDB(t)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: intString(channel.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/channel/1/custom-balance", bytes.NewBufferString(`{"user_id":9007199254740993}`))
	ctx.Request.Header.Set("Content-Type", "application/json")

	UpdateChannelCustomBalance(ctx)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"user_id":"9007199254740993"`)
}

func intString(value int) string {
	return strconv.Itoa(value)
}
