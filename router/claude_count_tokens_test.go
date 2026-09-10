package router

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClaudeCodeCountTokensForwardsNativeResultAndRefundsPrecharge(t *testing.T) {
	setupRelayRouterTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.Channel{}, &model.UserSubscription{}, &model.SubscriptionPlan{}))
	originalCache, originalBatch, originalLogs := common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled
	originalCount := constant.CountToken
	originalRatios := ratio_setting.ModelRatio2JSONString()
	common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled = false, false, false
	constant.CountToken = false
	require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"claude-count-fixture":1}`))
	t.Cleanup(func() {
		common.MemoryCacheEnabled, common.BatchUpdateEnabled, common.LogConsumeEnabled = originalCache, originalBatch, originalLogs
		constant.CountToken = originalCount
		require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(originalRatios))
	})

	type capturedRequest struct {
		path string
		body string
		err  error
	}
	captured := make(chan capturedRequest, 1)
	const upstreamResponse = `{"input_tokens":741,"fixture":"upstream"}`
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		captured <- capturedRequest{path: r.URL.Path, body: string(body), err: err}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, upstreamResponse)
	}))
	t.Cleanup(upstream.Close)
	service.InitHttpClient()
	t.Cleanup(service.ResetProxyClientCache)

	user := model.User{Username: "native-count-user", Status: common.UserStatusEnabled, Group: "default", Quota: 100000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "nativecountfixturekey", Status: common.TokenStatusEnabled, ExpiredTime: -1, RemainQuota: 100000, Group: "default"}
	require.NoError(t, model.DB.Create(&token).Error)
	channel := model.Channel{Type: constant.ChannelTypeClaudeCode, Name: "native-count", Key: "synthetic-upstream-key", Status: common.ChannelStatusEnabled, BaseURL: &upstream.URL, Models: "claude-count-fixture", Group: "default"}
	require.NoError(t, channel.Insert())

	const body = `{"model":"claude-count-fixture","messages":[{"role":"user","content":"hello"}],"tools":[{"name":"lookup","input_schema":{"type":"object"}}]}`
	engine := gin.New()
	SetRelayRouter(engine)
	request := httptest.NewRequest(http.MethodPost, "/v1/messages/count_tokens", strings.NewReader(body))
	request.Header.Set("Authorization", "Bearer nativecountfixturekey")
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	engine.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
	assert.JSONEq(t, upstreamResponse, recorder.Body.String())
	select {
	case got := <-captured:
		require.NoError(t, got.err)
		assert.Equal(t, "/v1/messages/count_tokens", got.path)
		assert.Equal(t, body, got.body)
	default:
		t.Fatal("native counting request did not reach the selected channel")
	}
	require.NoError(t, model.DB.First(&user, user.Id).Error)
	require.NoError(t, model.DB.First(&token, token.Id).Error)
	assert.Equal(t, 100000, user.Quota)
	assert.Zero(t, user.UsedQuota)
	assert.Equal(t, 100000, token.RemainQuota)
	assert.Zero(t, token.UsedQuota)
}
