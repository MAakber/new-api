package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateChannelProxy(t *testing.T) {
	tests := []struct {
		name    string
		proxy   string
		wantErr bool
	}{
		{name: "empty"},
		{name: "http", proxy: "http://proxy.example:8080"},
		{name: "https", proxy: "https://proxy.example:8443"},
		{name: "socks5", proxy: "socks5://proxy.example"},
		{name: "socks5h", proxy: "socks5h://proxy.example:1080/"},
		{name: "unsupported", proxy: "ftp://proxy.example", wantErr: true},
		{name: "path", proxy: "socks5://proxy.example:1080/path", wantErr: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setting, err := common.Marshal(dto.ChannelSettings{Proxy: test.proxy})
			require.NoError(t, err)
			channel := &model.Channel{
				Type:    constant.ChannelTypeOpenAI,
				Setting: common.GetPointer(string(setting)),
			}

			err = validateChannel(channel, false)

			if test.wantErr {
				require.ErrorContains(t, err, "invalid channel proxy")
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestValidateChannelRequiresCustomBaseURL(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		baseURL     *string
		wantErr     bool
		errMessage  string
	}{
		{name: "New API missing", channelType: constant.ChannelTypeNewAPI, wantErr: true, errMessage: "New API channel base URL cannot be empty"},
		{name: "Codex blank", channelType: constant.ChannelTypeCodexCompatibility, baseURL: common.GetPointer("  "), wantErr: true, errMessage: "Codex channel base URL cannot be empty"},
		{name: "Claude Code configured", channelType: constant.ChannelTypeClaudeCode, baseURL: common.GetPointer("https://proxy.example")},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := &model.Channel{
				Type:    test.channelType,
				BaseURL: test.baseURL,
			}

			err := validateChannel(channel, false)

			if test.wantErr {
				require.ErrorContains(t, err, test.errMessage)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestCompatibilityChannelRegistration(t *testing.T) {
	tests := []struct {
		name        string
		channelType int
		apiType     int
		endpoints   []constant.EndpointType
	}{
		{
			name:        "Codex",
			channelType: constant.ChannelTypeCodexCompatibility,
			apiType:     constant.APITypeOpenAI,
			endpoints:   []constant.EndpointType{constant.EndpointTypeOpenAIResponse},
		},
		{
			name:        "Claude Code",
			channelType: constant.ChannelTypeClaudeCode,
			apiType:     constant.APITypeAnthropic,
			endpoints:   []constant.EndpointType{constant.EndpointTypeAnthropic, constant.EndpointTypeOpenAI},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			apiType, ok := common.ChannelType2APIType(test.channelType)

			require.True(t, ok)
			assert.Equal(t, test.apiType, apiType)
			require.NotEqual(t, "Unknown", constant.GetChannelTypeName(test.channelType))
			require.Greater(t, len(constant.ChannelBaseURLs), test.channelType)
			assert.Empty(t, constant.ChannelBaseURLs[test.channelType])
			assert.Equal(t, test.endpoints, common.GetEndpointTypesByChannelType(test.channelType, "gpt-5"))
		})
	}
}

func TestCodexCompatibilityChannelTestUsesStreamingResponses(t *testing.T) {
	channel := &model.Channel{Type: constant.ChannelTypeCodexCompatibility}

	assert.Equal(t,
		string(constant.EndpointTypeOpenAIResponse),
		normalizeChannelTestEndpoint(channel, "gpt-5.6-sol", ""),
	)
	assert.Equal(t,
		string(constant.EndpointTypeOpenAIResponse),
		normalizeChannelTestEndpoint(channel, "gpt-5.6-sol", "auto"),
	)
	assert.Equal(t,
		string(constant.EndpointTypeOpenAI),
		normalizeChannelTestEndpoint(channel, "gpt-5.6-sol", string(constant.EndpointTypeOpenAI)),
	)
	assert.True(t, shouldUseStreamForAutomaticChannelTest(channel))

	request := buildTestRequest(
		"gpt-5.6-sol",
		string(constant.EndpointTypeOpenAIResponse),
		channel,
		true,
	)
	responsesRequest, ok := request.(*dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.NotNil(t, responsesRequest.Stream)
	assert.True(t, *responsesRequest.Stream)
}

func TestBuildChannelTestRequestUsesConfiguredMessage(t *testing.T) {
	const message = "channel probe"

	chatRequest, ok := buildTestRequestWithMessage(
		"gpt-test",
		string(constant.EndpointTypeOpenAI),
		&model.Channel{Type: constant.ChannelTypeOpenAI},
		false,
		message,
		nil,
	).(*dto.GeneralOpenAIRequest)
	require.True(t, ok)
	require.Len(t, chatRequest.Messages, 1)
	assert.Equal(t, message, chatRequest.Messages[0].StringContent())

	responsesRequest, ok := buildTestRequestWithMessage(
		"gpt-test",
		string(constant.EndpointTypeOpenAIResponse),
		&model.Channel{Type: constant.ChannelTypeOpenAI},
		true,
		message,
		nil,
	).(*dto.OpenAIResponsesRequest)
	require.True(t, ok)
	assert.Empty(t, responsesRequest.Instructions)
	var responsesInput []dto.Message
	require.NoError(t, json.Unmarshal(responsesRequest.Input, &responsesInput))
	require.Len(t, responsesInput, 1)
	assert.Equal(t, message, responsesInput[0].StringContent())

	embeddingRequest, ok := buildTestRequestWithMessage(
		"text-embedding-test",
		string(constant.EndpointTypeEmbeddings),
		&model.Channel{Type: constant.ChannelTypeOpenAI},
		false,
		message,
		nil,
	).(*dto.EmbeddingRequest)
	require.True(t, ok)
	assert.Equal(t, []any{"hello world"}, embeddingRequest.Input)
}

func TestBuildWarmupRequestInjectsSystemPromptAsInstructions(t *testing.T) {
	systemPrompt := "  You are Codex, an agent based on GPT-5.  "

	responsesRequest, ok := buildTestRequestWithMessage(
		"gpt-5.6-sol",
		string(constant.EndpointTypeOpenAIResponse),
		&model.Channel{Type: constant.ChannelTypeCodexCompatibility},
		true,
		"warmup probe",
		common.GetPointer(systemPrompt),
	).(*dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.JSONEq(t, fmt.Sprintf("%q", systemPrompt), string(responsesRequest.Instructions))
	var responsesInput []dto.Message
	require.NoError(t, json.Unmarshal(responsesRequest.Input, &responsesInput))
	require.Len(t, responsesInput, 1)
	assert.Equal(t, "warmup probe", responsesInput[0].StringContent())

	compactRequest, ok := buildTestRequestWithMessage(
		"gpt-5.6-sol"+ratio_setting.CompactModelSuffix,
		string(constant.EndpointTypeOpenAIResponseCompact),
		&model.Channel{Type: constant.ChannelTypeCodexCompatibility},
		false,
		"warmup probe",
		common.GetPointer(systemPrompt),
	).(*dto.OpenAIResponsesCompactionRequest)
	require.True(t, ok)
	require.JSONEq(t, fmt.Sprintf("%q", systemPrompt), string(compactRequest.Instructions))

	// Blank system prompt: the field must still be present as a JSON empty string.
	noPrompt, ok := buildTestRequestWithMessage(
		"gpt-5.6-sol",
		string(constant.EndpointTypeOpenAIResponse),
		&model.Channel{Type: constant.ChannelTypeCodexCompatibility},
		true,
		"warmup probe",
		common.GetPointer("  "),
	).(*dto.OpenAIResponsesRequest)
	require.True(t, ok)
	require.JSONEq(t, `""`, string(noPrompt.Instructions))

	noPromptCompact, ok := buildTestRequestWithMessage(
		"gpt-5.6-sol"+ratio_setting.CompactModelSuffix,
		string(constant.EndpointTypeOpenAIResponseCompact),
		&model.Channel{Type: constant.ChannelTypeCodexCompatibility},
		false,
		"warmup probe",
		common.GetPointer("\t"),
	).(*dto.OpenAIResponsesCompactionRequest)
	require.True(t, ok)
	require.JSONEq(t, `""`, string(noPromptCompact.Instructions))
}

func TestQueueWarmupSystemPromptOwnership(t *testing.T) {
	const systemPrompt = "  configured prompt  "
	settingBytes, err := common.Marshal(dto.ChannelSettings{
		SystemPrompt:         systemPrompt,
		SystemPromptOverride: true,
	})
	require.NoError(t, err)

	tests := []struct {
		name           string
		channelType    int
		controllerOwns bool
	}{
		{name: "Codex adaptor owns injection", channelType: constant.ChannelTypeCodex},
		{name: "Codex compatibility controller owns injection", channelType: constant.ChannelTypeCodexCompatibility, controllerOwns: true},
		{name: "ordinary channel has no queue prompt injection", channelType: constant.ChannelTypeOpenAI},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := &model.Channel{
				Type:    test.channelType,
				Setting: common.GetPointer(string(settingBytes)),
			}
			instructions := queueWarmupControllerInstructions(channel)
			if test.controllerOwns {
				require.NotNil(t, instructions)
				assert.Equal(t, systemPrompt, *instructions)
				return
			}
			assert.Nil(t, instructions)
		})
	}
}

func TestResolveChannelTestMessageUsesOverrideThenGlobalDefault(t *testing.T) {
	setting := operation_setting.GetMonitorSetting()
	original := *setting
	t.Cleanup(func() { *setting = original })
	setting.ChannelTestMessage = "saved probe"

	message, err := resolveChannelTestMessage("  one-off probe  ")
	require.NoError(t, err)
	assert.Equal(t, "one-off probe", message)

	message, err = resolveChannelTestMessage("  ")
	require.NoError(t, err)
	assert.Equal(t, "saved probe", message)
}

func TestReadChannelTestResponseBodyBoundsStreamCapture(t *testing.T) {
	body := io.NopCloser(strings.NewReader(strings.Repeat("x", channelTestResponsePreviewMaxBytes+32)))

	preview, truncated, err := readTestResponseBody(body, true)
	require.NoError(t, err)
	assert.Len(t, preview, channelTestResponsePreviewMaxBytes)
	assert.True(t, truncated)
}

func TestReadChannelTestResponseBodyKeepsNonStreamBodyForValidation(t *testing.T) {
	expected := strings.Repeat("x", channelTestResponsePreviewMaxBytes+32)
	body := io.NopCloser(strings.NewReader(expected))

	response, truncated, err := readTestResponseBody(body, false)
	require.NoError(t, err)
	assert.Equal(t, expected, string(response))
	assert.False(t, truncated)
}

func TestSanitizeChannelTestResponsePreviewRedactsSecretsButKeepsUsage(t *testing.T) {
	preview := sanitizeChannelTestResponsePreview([]byte(`{
		"authorization":"Bearer private-value",
		"access_token":"private-token",
		"output_tokens":12,
		"output":[{"content":[{"type":"output_text","text":"hello"}]}]
	}`))

	assert.NotContains(t, preview, "private-value")
	assert.NotContains(t, preview, "private-token")
	assert.Contains(t, preview, `"output_tokens":12`)
	assert.Contains(t, preview, `"text":"hello"`)
}

func TestChannelTestDetailedRejectsOversizedMessageBeforeChannelLookup(t *testing.T) {
	gina := gin.Mode()
	gin.SetMode(gin.TestMode)
	t.Cleanup(func() { gin.SetMode(gina) })

	body, err := common.Marshal(channelTestRequest{
		Message: strings.Repeat("x", operation_setting.ChannelTestMessageMaxRunes+1),
	})
	require.NoError(t, err)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "1"}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/test/1", bytes.NewReader(body))

	TestChannelDetailed(ctx)

	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Contains(t, recorder.Body.String(), "must not exceed")
}

func TestCodeBuddyChannelUsesOpenAIChatCompletions(t *testing.T) {
	apiType, ok := common.ChannelType2APIType(constant.ChannelTypeCodeBuddy)

	require.True(t, ok)
	assert.Equal(t, 63, constant.ChannelTypeCodeBuddy)
	assert.Equal(t, 63, constant.ChannelTypeDummy)
	assert.Equal(t, "CodeBuddy", constant.GetChannelTypeName(constant.ChannelTypeCodeBuddy))
	assert.Equal(t, constant.APITypeOpenAI, apiType)
	require.IsType(t, &openai.Adaptor{}, relay.GetAdaptor(apiType))
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI},
		common.GetEndpointTypesByChannelType(constant.ChannelTypeCodeBuddy, "o3-pro"))
	assert.Equal(t, []constant.EndpointType{constant.EndpointTypeOpenAI},
		common.GetEndpointTypesByChannelType(constant.ChannelTypeCodeBuddy, "gpt-image-1"))
	require.Greater(t, len(constant.ChannelBaseURLs), constant.ChannelTypeCodeBuddy)
	assert.Empty(t, constant.ChannelBaseURLs[constant.ChannelTypeCodeBuddy])
}

func TestNewAPIChannelRegistration(t *testing.T) {
	apiType, ok := common.ChannelType2APIType(constant.ChannelTypeNewAPI)

	require.True(t, ok)
	assert.Equal(t, constant.APITypeNewAPI, apiType)
	assert.Equal(t, "New API", constant.GetChannelTypeName(constant.ChannelTypeNewAPI))
	require.Greater(t, len(constant.ChannelBaseURLs), constant.ChannelTypeNewAPI)
	assert.Empty(t, constant.ChannelBaseURLs[constant.ChannelTypeNewAPI])
}

func TestResponsesCompactAPITypeSupport(t *testing.T) {
	tests := []struct {
		name    string
		apiType int
		want    bool
	}{
		{name: "OpenAI", apiType: constant.APITypeOpenAI, want: true},
		{name: "Codex", apiType: constant.APITypeCodex, want: true},
		{name: "Advanced Custom", apiType: constant.APITypeAdvancedCustom, want: true},
		{name: "Sub2API", apiType: constant.APITypeSub2API, want: true},
		{name: "New API", apiType: constant.APITypeNewAPI, want: true},
		{name: "Anthropic", apiType: constant.APITypeAnthropic, want: false},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, common.IsResponsesCompactAPIType(test.apiType))
		})
	}
}

func TestMultiprotocolGatewayEndpointTypes(t *testing.T) {
	want := []constant.EndpointType{
		constant.EndpointTypeOpenAI,
		constant.EndpointTypeOpenAIResponse,
		constant.EndpointTypeOpenAIResponseCompact,
		constant.EndpointTypeAnthropic,
		constant.EndpointTypeGemini,
		constant.EndpointTypeOpenAIAlphaSearch,
	}

	assert.Equal(t, want, common.GetEndpointTypesByChannelType(constant.ChannelTypeNewAPI, "gpt-5"))
	assert.Equal(t, want, common.GetEndpointTypesByChannelType(constant.ChannelTypeSub2API, "gpt-5"))
}

func TestCopyChannelRejectsInvalidLegacyProxySettings(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	settingBytes, err := common.Marshal(dto.ChannelSettings{
		Proxy: "socks5://proxy.example/legacy-path",
	})
	require.NoError(t, err)
	setting := string(settingBytes)
	origin := &model.Channel{
		Type:    constant.ChannelTypeOpenAI,
		Name:    "legacy proxy channel",
		Key:     "test-key",
		Models:  "gpt-test",
		Group:   "default",
		Setting: &setting,
	}
	require.NoError(t, db.Create(origin).Error)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", origin.Id)}}
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/copy", nil)

	CopyChannel(ctx)

	assert.Contains(t, recorder.Body.String(), "invalid channel settings")
	var channelCount int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channelCount).Error)
	assert.Equal(t, int64(1), channelCount)
}

func TestDeleteChannelResetsProxyCacheWhenPreReadFails(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	service.ResetProxyClientCache()
	t.Cleanup(service.ResetProxyClientCache)

	proxyURL := "http://proxy.example:8080"
	beforeDelete, err := service.GetHttpClientWithProxy(proxyURL)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Params = gin.Params{{Key: "id", Value: "999999"}}
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/channel/999999", nil)

	DeleteChannel(ctx)

	assert.Contains(t, recorder.Body.String(), `"success":true`)
	afterDelete, err := service.GetHttpClientWithProxy(proxyURL)
	require.NoError(t, err)
	assert.NotSame(t, beforeDelete, afterDelete)
}

func TestDeleteChannelBatchReportsAndAuditsActualDeletedCount(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	channel := &model.Channel{Name: "existing", Key: "test-key"}
	require.NoError(t, db.Create(channel).Error)

	requestBody, err := common.Marshal(ChannelBatch{Ids: []int{channel.Id, 999999}})
	require.NoError(t, err)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodDelete, "/api/channel/batch", bytes.NewReader(requestBody))
	ctx.Request.Header.Set("Content-Type", "application/json")

	DeleteChannelBatch(ctx)

	var response struct {
		Success bool  `json:"success"`
		Data    int64 `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Equal(t, int64(1), response.Data)

	var auditLog model.Log
	require.NoError(t, db.Order("id desc").First(&auditLog).Error)
	var auditData struct {
		Operation struct {
			Params map[string]any `json:"params"`
		} `json:"op"`
	}
	require.NoError(t, common.UnmarshalJsonStr(auditLog.Other, &auditData))
	assert.Equal(t, float64(1), auditData.Operation.Params["count"])
}

func TestSettleTestQuotaUsesTieredBilling(t *testing.T) {
	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode:   "tiered_expr",
			ExprString:    `param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`,
			ExprHash:      billingexpr.ExprHashString(`param("stream") == true ? tier("stream", p * 3) : tier("base", p * 2)`),
			GroupRatio:    1,
			EstimatedTier: "stream",
			QuotaPerUnit:  common.QuotaPerUnit,
			ExprVersion:   1,
		},
		BillingRequestInput: &billingexpr.RequestInput{
			Body: []byte(`{"stream":true}`),
		},
	}

	quota, result := settleTestQuota(info, types.PriceData{
		ModelRatio:      1,
		CompletionRatio: 2,
	}, &dto.Usage{
		PromptTokens: 1000,
	})

	require.Equal(t, 1500, quota)
	require.NotNil(t, result)
	require.Equal(t, "stream", result.MatchedTier)
}

func TestBuildTestLogOtherInjectsTieredInfo(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())

	info := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			BillingMode: "tiered_expr",
			ExprString:  `tier("base", p * 2)`,
		},
		ChannelMeta: &relaycommon.ChannelMeta{},
	}
	priceData := types.PriceData{
		GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
	}
	usage := &dto.Usage{
		PromptTokensDetails: dto.InputTokenDetails{
			CachedTokens: 12,
		},
	}

	other := buildTestLogOther(ctx, info, priceData, usage, &billingexpr.TieredResult{
		MatchedTier: "base",
	})

	require.Equal(t, "tiered_expr", other["billing_mode"])
	require.Equal(t, "base", other["matched_tier"])
	require.NotEmpty(t, other["expr_b64"])
}

func TestResolveChannelTestUserIDUsesRequestUser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Set("id", 2)

	userID, err := resolveChannelTestUserID(ctx)

	require.NoError(t, err)
	require.Equal(t, 2, userID)
}

func TestSelectChannelsForAutomaticTestPassiveRecoveryOnlyUsesAutoDisabled(t *testing.T) {
	channels := []*model.Channel{
		{Id: 1, Status: common.ChannelStatusEnabled},
		{Id: 2, Status: common.ChannelStatusAutoDisabled},
		{Id: 3, Status: common.ChannelStatusManuallyDisabled},
	}

	selected := selectChannelsForAutomaticTest(channels, operation_setting.ChannelTestModePassiveRecovery)

	require.Len(t, selected, 1)
	require.Equal(t, 2, selected[0].Id)
}

func TestSelectChannelsForAutomaticTestScheduledSkipsManualDisabled(t *testing.T) {
	channels := []*model.Channel{
		{Id: 1, Status: common.ChannelStatusEnabled},
		{Id: 2, Status: common.ChannelStatusAutoDisabled},
		{Id: 3, Status: common.ChannelStatusManuallyDisabled},
	}

	selected := selectChannelsForAutomaticTest(channels, operation_setting.ChannelTestModeScheduledAll)

	require.Len(t, selected, 2)
	require.Equal(t, 1, selected[0].Id)
	require.Equal(t, 2, selected[1].Id)
}

func TestTestAllChannelsRejectsExistingActiveTask(t *testing.T) {
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.SystemTask{}, &model.SystemTaskLock{}))

	existing, err := model.CreateSystemTask(model.SystemTaskTypeChannelTest, nil, nil)
	require.NoError(t, err)

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, "/api/channel/test", nil)

	TestAllChannels(ctx)

	require.Equal(t, http.StatusConflict, recorder.Code)
	require.Contains(t, recorder.Body.String(), existing.TaskID)
	require.Contains(t, recorder.Body.String(), "已有通道测试任务正在运行或等待中")
}
