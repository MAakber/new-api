package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSharedTaskEndpointPreservesChannelOwnership(t *testing.T) {
	for _, tc := range []struct {
		name            string
		ordinaryFirst   bool
		pluginsDisabled bool
		originTask      bool
		checkRetry      bool
		alias           bool
		body            string
		wantChannel     int
		wantPlugin      bool
	}{
		{name: "ordinary stream ignores plugin mode restrictions", ordinaryFirst: true, body: `{"model":"coexist-model","stream":true}`, wantChannel: 1},
		{name: "disabled plugins leave ordinary channels available", pluginsDisabled: true, body: `{"model":"coexist-model","stream":true}`, wantChannel: 1},
		{name: "explicit plugin retries cannot use ordinary channels", checkRetry: true, body: `{"model":"coexist-model"}`, wantChannel: 2, wantPlugin: true},
		{name: "origin task replaces initial channel before relay", originTask: true, body: `{"model":"coexist-model","originTaskIds":["task_prior"]}`, wantChannel: 3, wantPlugin: true},
		{name: "declared model case variant reaches bound plugin", body: `{"model":"COEXIST-MODEL"}`, wantChannel: 2, wantPlugin: true},
		{name: "mapped alias case variant reaches bound plugin", alias: true, body: `{"model":"COEXIST-ALIAS"}`, wantChannel: 2, wantPlugin: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			setupOriginTaskDB(t)
			require.NoError(t, model.DB.AutoMigrate(&model.Ability{}))
			previousRegistry, previousCache := jsplugin.DefaultRegistry, common.MemoryCacheEnabled
			jsplugin.DefaultRegistry = jsplugin.NewRegistry()
			common.MemoryCacheEnabled = false
			t.Cleanup(func() {
				jsplugin.DefaultRegistry = previousRegistry
				common.MemoryCacheEnabled = previousCache
			})
			_, err := jsplugin.DefaultRegistry.Register(taskResponsesPluginSource(
				"coexist-plugin", constant.ChannelTypeOpenAI, `["coexist-model"]`, `["sync"]`,
				`renderFinal: function() { return {}; }`,
				`return {model: ctx.model, requestBody: ctx.requestBody, originTaskIds: ctx.requestBody.originTaskIds || []};`,
			), jsplugin.Options{})
			require.NoError(t, err)
			jsplugin.DefaultRegistry.SetEnabled(!tc.pluginsDisabled)
			ordinaryPriority, pluginPriority, originPriority := int64(1), int64(20), int64(10)
			if tc.ordinaryFirst {
				ordinaryPriority = 30
			}
			channels := []model.Channel{
				{Id: 1, Type: constant.ChannelTypeOpenAI, Priority: &ordinaryPriority},
				{Id: 2, Type: constant.ChannelTypeTaskPlugin, Priority: &pluginPriority},
			}
			if tc.originTask {
				channels = append(channels, model.Channel{Id: 3, Type: constant.ChannelTypeTaskPlugin, Priority: &originPriority})
			}
			for i := range channels {
				ch := &channels[i]
				ch.Status, ch.Key, ch.Models, ch.Group = common.ChannelStatusEnabled, "local-fixture", "coexist-model", "default"
				if ch.Type == constant.ChannelTypeTaskPlugin {
					ch.SetSetting(kitdto.ChannelSettings{TaskPluginKey: "coexist-plugin"})
					if tc.alias {
						ch.Models = "coexist-alias"
						ch.ModelMapping = common.GetPointer(`{"coexist-alias":"coexist-model"}`)
					}
				}
				require.NoError(t, model.DB.Create(ch).Error)
				require.NoError(t, model.DB.Create(&model.Ability{ChannelId: ch.Id, Group: ch.Group, Model: ch.Models, Enabled: true, Priority: ch.Priority, Weight: 1}).Error)
			}
			model.InitChannelCache()
			if tc.originTask {
				insertOriginOwnedTask(t, "task_prior", 7, 3, "coexist-plugin")
			}
			reachedRelay := false
			router := gin.New()
			router.POST("/v1/responses", func(c *gin.Context) {
				common.SetContextKey(c, constant.ContextKeyUserId, 7)
				common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
				common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
				c.Next()
			}, TaskPluginEndpointCandidates(), Distribute(), PinTaskPluginEndpoint(), PrepareTaskPluginEndpoint(), func(c *gin.Context) {
				reachedRelay = true
				assert.Equal(t, tc.wantChannel, common.GetContextKeyInt(c, constant.ContextKeyChannelId))
				_, pinned := c.Get(jsplugin.ContextKeyPinnedEndpoint)
				assert.Equal(t, tc.wantPlugin, pinned)
				wantModel := "coexist-model"
				if tc.alias {
					wantModel = "coexist-alias"
				}
				assert.Equal(t, wantModel, c.GetString("original_model"))
				if tc.checkRetry {
					require.NoError(t, model.DB.Model(&model.Ability{}).Where("channel_id = ?", 2).Update("enabled", false).Error)
					retryChannel, _, _ := service.CacheGetRandomSatisfiedChannel(&service.RetryParam{Ctx: c, TokenGroup: "default", ModelName: "coexist-model", Retry: common.GetPointer(1)})
					assert.Nil(t, retryChannel, "a pinned plugin must not retry onto the ordinary provider")
				}
				c.Status(http.StatusNoContent)
			})
			request := httptest.NewRequest(http.MethodPost, "/v1/responses", strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, request)
			assert.Equal(t, http.StatusNoContent, recorder.Code, recorder.Body.String())
			assert.True(t, reachedRelay)
		})
	}
}
