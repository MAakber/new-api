package codex

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetRequestURLAlphaSearch(t *testing.T) {
	adaptor := &Adaptor{}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType:    constant.ChannelTypeCodex,
			ChannelBaseUrl: "https://chatgpt.com",
		},
		RelayMode: relayconstant.RelayModeAlphaSearch,
	}

	url, err := adaptor.GetRequestURL(info)
	require.NoError(t, err)
	assert.Equal(t, "https://chatgpt.com/backend-api/codex/alpha/search", url)
}

func TestLegacyCodexIdentityChangesOnlyClientVersionFields(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	ctx.Request.Header.Set("Content-Type", "text/plain")

	info := &relaycommon.RelayInfo{
		IsStream: true,
		ChannelMeta: &relaycommon.ChannelMeta{
			ChannelType: constant.ChannelTypeCodex,
			ApiKey:      `{"access_token":"access-token","account_id":"account-id"}`,
			ChannelOtherSettings: dto.ChannelOtherSettings{
				ClientIdentity: &dto.ClientIdentityConfig{
					Profile:  dto.ClientIdentityProfileCodexLegacy,
					Version:  "1.2.3",
					Platform: dto.ClientIdentityPlatformWindowsX64,
				},
			},
		},
	}
	headers := http.Header{}
	require.NoError(t, (&Adaptor{}).SetupRequestHeader(ctx, &headers, info))

	assert.Equal(t, "Bearer access-token", headers.Get("Authorization"))
	assert.Equal(t, "account-id", headers.Get("chatgpt-account-id"))
	assert.Equal(t, "responses=experimental", headers.Get("OpenAI-Beta"))
	assert.Equal(t, "codex_cli_rs", headers.Get("originator"))
	assert.Equal(t, "codex_cli_rs/1.2.3 (windows-x64)", headers.Get("User-Agent"))
	assert.Equal(t, "application/json", headers.Get("Content-Type"))
	assert.Equal(t, "text/event-stream", headers.Get("Accept"))
}
