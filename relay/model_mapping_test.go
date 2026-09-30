package relay_test

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Exercise real handlers and HTTP transport: changing the parsed DTO alone
// does not prove that a mapped model reaches the provider in passthrough mode.
func TestModelMappingReachesUpstream(t *testing.T) {
	settings := model_setting.GetGlobalSettings()
	previous := *settings
	t.Cleanup(func() { *settings = previous })
	for _, test := range []struct {
		name, path, raw     string
		channelType, mode   int
		passthrough, global bool
		request             func() dto.Request
		handler             func(*gin.Context, *relaycommon.RelayInfo) *types.NewAPIError
	}{
		{"chat", "/v1/chat/completions", `{"model":"public","messages":[{"role":"user","content":"hello"}]}`, constant.ChannelTypeOpenAI, relayconstant.RelayModeChatCompletions, false, false, func() dto.Request { return &dto.GeneralOpenAIRequest{} }, relay.TextHelper},
		{"chat channel passthrough", "/v1/chat/completions", `{"model":"public","messages":[{"role":"user","content":"hello"}],"vendor_extra":{"model":"nested","integer":9007199254740993,"zero":0,"flag":false}}`, constant.ChannelTypeOpenAI, relayconstant.RelayModeChatCompletions, true, false, func() dto.Request { return &dto.GeneralOpenAIRequest{} }, relay.TextHelper},
		{"chat global passthrough", "/v1/chat/completions", `{"model":"public","messages":[{"role":"user","content":"hello"}],"vendor_extra":{"model":"nested"}}`, constant.ChannelTypeOpenAI, relayconstant.RelayModeChatCompletions, false, true, func() dto.Request { return &dto.GeneralOpenAIRequest{} }, relay.TextHelper},
		{"responses", "/v1/responses", `{"model":"public","input":"hello"}`, constant.ChannelTypeOpenAI, relayconstant.RelayModeResponses, false, false, func() dto.Request { return &dto.OpenAIResponsesRequest{} }, relay.ResponsesHelper},
		{"responses passthrough", "/v1/responses", `{"model":"public","input":"hello","vendor_extra":{"model":"nested"}}`, constant.ChannelTypeOpenAI, relayconstant.RelayModeResponses, true, false, func() dto.Request { return &dto.OpenAIResponsesRequest{} }, relay.ResponsesHelper},
		{"claude passthrough", "/v1/messages", `{"model":"public","max_tokens":10,"messages":[{"role":"user","content":"hello"}],"vendor_extra":{"model":"nested"}}`, constant.ChannelTypeAnthropic, relayconstant.RelayModeChatCompletions, true, false, func() dto.Request { return &dto.ClaudeRequest{} }, relay.ClaudeHelper},
	} {
		t.Run(test.name, func(t *testing.T) {
			*settings = previous
			settings.PassThroughRequestEnabled = test.global
			settings.ChatCompletionsToResponsesPolicy = model_setting.ChatCompletionsToResponsesPolicy{}
			type receivedRequest struct {
				body []byte
				path string
				err  error
			}
			received := make(chan receivedRequest, 1)
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				body, err := io.ReadAll(r.Body)
				received <- receivedRequest{body, r.URL.Path, err}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":{"message":"mapping-contract","type":"invalid_request_error"}}`)
			}))
			t.Cleanup(upstream.Close)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, test.path, strings.NewReader(test.raw))
			c.Request.Header.Set("Content-Type", "application/json")
			t.Cleanup(func() { common.CleanupBodyStorage(c) })
			common.SetContextKey(c, constant.ContextKeyOriginalModel, "public")
			common.SetContextKey(c, constant.ContextKeyChannelType, test.channelType)
			common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL)
			common.SetContextKey(c, constant.ContextKeyChannelKey, "local-fixture-only")
			common.SetContextKey(c, constant.ContextKeyChannelSetting, dto.ChannelSettings{PassThroughBodyEnabled: test.passthrough})
			request := test.request()
			require.NoError(t, common.Unmarshal([]byte(test.raw), request))
			originalRequest, err := common.Marshal(request)
			require.NoError(t, err)
			info := &relaycommon.RelayInfo{Request: request, OriginModelName: "public", RequestURLPath: test.path, RelayMode: test.mode}

			// Reuse the original parsed request and body as real channel retries do.
			for _, target := range []string{"provider-first", "provider-retry", "public"} {
				mapping, err := common.Marshal(map[string]string{"public": "intermediate", "intermediate": target})
				require.NoError(t, err)
				if target == "public" {
					mapping = []byte("{}")
				}
				common.SetContextKey(c, constant.ContextKeyChannelModelMapping, string(mapping))
				apiErr := test.handler(c, info)
				require.NotNil(t, apiErr)
				require.Contains(t, apiErr.Error(), "mapping-contract")
				require.Len(t, received, 1)
				actual := <-received
				require.NoError(t, actual.err)
				assert.Equal(t, test.path, actual.path)
				var body struct {
					Model string `json:"model"`
				}
				require.NoError(t, common.Unmarshal(actual.body, &body))
				assert.Equal(t, target, body.Model)
				assert.Equal(t, "public", info.OriginModelName)
				if test.passthrough || test.global {
					afterRequest, err := common.Marshal(request)
					require.NoError(t, err)
					assert.Equal(t, string(originalRequest), string(afterRequest))
					assert.Equal(t, strings.Replace(test.raw, `"model":"public"`, `"model":"`+target+`"`, 1), string(actual.body), "only the top-level model may change")
					storage, err := common.GetBodyStorage(c)
					require.NoError(t, err)
					original, err := storage.Bytes()
					require.NoError(t, err)
					assert.Equal(t, test.raw, string(original), "retry source must stay immutable")
				}
			}
		})
	}
}

func TestSavedChannelMappingReachesUpstream(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	oldDB, oldLogDB, oldOptions := model.DB, model.LOG_DB, common.OptionMap
	oldCache := common.MemoryCacheEnabled
	oldRedis := common.RedisEnabled
	oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	model.DB, model.LOG_DB, common.OptionMap = db, db, map[string]string{}
	common.MemoryCacheEnabled = true
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		// Empty the fixture's cache before restoring the prior globals.
		db.Where("1 = 1").Delete(&model.Channel{})
		model.InitChannelCache()
		model.DB, model.LOG_DB, common.OptionMap = oldDB, oldLogDB, oldOptions
		common.MemoryCacheEnabled = oldCache
		common.RedisEnabled = oldRedis
		common.SetDatabaseTypes(oldMainType, oldLogType)
		require.NoError(t, sqlDB.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.Option{}, &model.AutoPriceGuard{}, &model.User{}, &model.AuditLog{}))
	require.NoError(t, model.SeedCanonicalPricingOptions())
	require.NoError(t, db.Create(&model.User{Id: 1, Username: "mapping-fixture", Role: 100}).Error)
	received := make(chan string, 1)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Model string `json:"model"`
		}
		if err := common.DecodeJson(r.Body, &body); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		received <- body.Model
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(w, `{"error":{"message":"saved-mapping-contract","type":"invalid_request_error"}}`)
	}))
	t.Cleanup(upstream.Close)
	created, err := service.CreateChannels([]model.Channel{{
		Name: "saved mapping fixture", Type: constant.ChannelTypeOpenAI,
		Key: "local-fixture-only", BaseURL: &upstream.URL, Models: "provider", Group: "default", Status: common.ChannelStatusEnabled,
	}}, service.ChannelMutationTriggerCreate)
	require.NoError(t, err)
	model.InitChannelCache()
	settings := model_setting.GetGlobalSettings()
	previous := *settings
	t.Cleanup(func() { *settings = previous })
	settings.PassThroughRequestEnabled = false
	settings.ChatCompletionsToResponsesPolicy = model_setting.ChatCompletionsToResponsesPolicy{}
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("id", 1); c.Set("role", 100); c.Next() })
	router.PUT("/api/channel/", controller.UpdateChannel)
	router.GET("/api/channel/:id", controller.GetChannel)
	for _, target := range []string{"provider", "provider-updated", ""} {
		mapping := ""
		if target != "" {
			mappingJSON, err := common.Marshal(map[string]string{"public": target})
			require.NoError(t, err)
			mapping = string(mappingJSON)
		}
		payload, err := common.Marshal(map[string]any{"id": created[0].Id, "models": "provider,public", "model_mapping": mapping})
		require.NoError(t, err)
		update := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodPut, "/api/channel/", strings.NewReader(string(payload)))
		request.Header.Set("Content-Type", "application/json")
		router.ServeHTTP(update, request)
		var result struct {
			Success bool          `json:"success"`
			Data    model.Channel `json:"data"`
		}
		require.NoError(t, common.Unmarshal(update.Body.Bytes(), &result))
		require.True(t, result.Success, update.Body.String())
		read := httptest.NewRecorder()
		router.ServeHTTP(read, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/channel/%d", created[0].Id), nil))
		require.NoError(t, common.Unmarshal(read.Body.Bytes(), &result))
		require.True(t, result.Success, read.Body.String())
		assert.Equal(t, mapping, result.Data.GetModelMapping())
		selected, err := model.GetRandomSatisfiedChannel("default", "public", 0, nil)
		require.NoError(t, err)
		require.NotNil(t, selected)
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
		common.SetContextKey(c, constant.ContextKeyOriginalModel, "public")
		require.Nil(t, middleware.SetupContextForSelectedChannel(c, selected, "public"))
		info := &relaycommon.RelayInfo{
			Request:         &dto.GeneralOpenAIRequest{Model: "public", Messages: []dto.Message{{Role: "user", Content: "hello"}}},
			OriginModelName: "public", RequestURLPath: "/v1/chat/completions", RelayMode: relayconstant.RelayModeChatCompletions,
		}
		apiErr := relay.TextHelper(c, info)
		require.NotNil(t, apiErr)
		require.Contains(t, apiErr.Error(), "saved-mapping-contract")
		require.Len(t, received, 1)
		want := target
		if want == "" {
			want = "public"
		}
		assert.Equal(t, want, <-received)
	}
}
