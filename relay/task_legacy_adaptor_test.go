package relay

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLegacyTaskSubmissionSurvivesDisabledPlugins(t *testing.T) {
	previous := jsplugin.DefaultRegistry.Enabled()
	jsplugin.DefaultRegistry.SetEnabled(false)
	t.Cleanup(func() { jsplugin.DefaultRegistry.SetEnabled(previous) })
	for _, test := range []struct {
		name        string
		channelType int
		body        string
		upstreamID  string
	}{
		{"alibaba", constant.ChannelTypeAli, `{"output":{"task_id":"upstream-1","task_status":"PENDING"}}`, "upstream-1"},
		{"doubao", constant.ChannelTypeDoubaoVideo, `{"id":"upstream-1"}`, "upstream-1"},
		{"volcengine", constant.ChannelTypeVolcEngine, `{"id":"upstream-1"}`, "upstream-1"},
		{"gemini", constant.ChannelTypeGemini, `{"name":"operations/upstream-1"}`, taskcommon.EncodeLocalTaskID("operations/upstream-1")},
		{"vertex", constant.ChannelTypeVertexAi, `{"name":"operations/upstream-1"}`, taskcommon.EncodeLocalTaskID("operations/upstream-1")},
		{"hailuo", constant.ChannelTypeMiniMax, `{"task_id":"upstream-1","base_resp":{"status_code":0}}`, "upstream-1"},
		{"jimeng", constant.ChannelTypeJimeng, `{"code":10000,"data":{"task_id":"upstream-1"}}`, "upstream-1"},
		{"kling", constant.ChannelTypeKling, `{"code":0,"data":{"task_id":"upstream-1"}}`, "upstream-1"},
		{"sora", constant.ChannelTypeSora, `{"id":"upstream-1"}`, "upstream-1"},
		{"openai", constant.ChannelTypeOpenAI, `{"id":"upstream-1"}`, "upstream-1"},
		{"vidu", constant.ChannelTypeVidu, `{"task_id":"upstream-1","state":"created"}`, "upstream-1"},
		{"suno", 0, `{"code":"success","data":"upstream-1"}`, "upstream-1"},
	} {
		t.Run(test.name, func(t *testing.T) {
			platform := constant.TaskPlatform(strconv.Itoa(test.channelType))
			if test.channelType == 0 {
				platform = constant.TaskPlatformSuno
			}
			recorder := httptest.NewRecorder()
			ctx, _ := gin.CreateTestContext(recorder)
			ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/videos", nil)
			selected, adaptor := getTaskAdaptorForRequest(ctx, platform)
			require.NotNil(t, adaptor)
			assert.Equal(t, platform, selected)
			result, err := adaptor.ParseResponse(ctx, &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(test.body))}, &relaycommon.RelayInfo{TaskRelayInfo: &relaycommon.TaskRelayInfo{PublicTaskID: "task_public"}, OriginModelName: "legacy-model"})
			require.Nil(t, err)
			require.NotNil(t, result)
			assert.Equal(t, test.upstreamID, result.UpstreamTaskID)
			assert.False(t, ctx.Writer.Written(), "Response must wait for the durable task/billing barrier")
			encoded, encodeErr := common.Marshal(result.ClientResponse)
			require.NoError(t, encodeErr)
			assert.Contains(t, string(encoded), "task_public")
			assert.NotContains(t, string(encoded), "upstream-1")
		})
	}
}
