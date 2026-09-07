package relay

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/setting/model_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPlaygroundImagesDoNotForwardRoutingFieldsWithPassthroughEnabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	original := model_setting.GetGlobalSettings().PassThroughRequestEnabled
	t.Cleanup(func() { model_setting.GetGlobalSettings().PassThroughRequestEnabled = original })
	for _, test := range []struct {
		name                         string
		multipart, globalPassthrough bool
	}{
		{"generation channel passthrough", false, false},
		{"generation global passthrough", false, true},
		{"edit channel passthrough", true, false},
		{"edit global passthrough", true, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			model_setting.GetGlobalSettings().PassThroughRequestEnabled = test.globalPassthrough
			var body bytes.Buffer
			contentType := "application/json"
			path := "/v1/images/generations"
			mode := relayconstant.RelayModeImagesGenerations
			if test.multipart {
				path = "/v1/images/edits"
				mode = relayconstant.RelayModeImagesEdits
				writer := multipart.NewWriter(&body)
				for key, value := range map[string]string{"model": "gpt-image-1", "prompt": "A cup", "group": "premium", "n": "1", "output_compression": "0"} {
					require.NoError(t, writer.WriteField(key, value))
				}
				file, err := writer.CreateFormFile("image", "cup.png")
				require.NoError(t, err)
				_, err = io.WriteString(file, "reference-image")
				require.NoError(t, err)
				require.NoError(t, writer.Close())
				contentType = writer.FormDataContentType()
			} else {
				_, err := io.WriteString(&body, `{"model":"gpt-image-1","prompt":"A cup","group":"premium","n":1,"output_compression":0}`)
				require.NoError(t, err)
			}
			type upstreamRequest struct {
				body              []byte
				contentType, path string
				err               error
			}
			requests := make(chan upstreamRequest, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				data, err := io.ReadAll(r.Body)
				requests <- upstreamRequest{data, r.Header.Get("Content-Type"), r.URL.Path, err}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				_, _ = io.WriteString(w, `{"error":{"message":"test upstream rejected image","type":"invalid_request_error"}}`)
			}))
			t.Cleanup(server.Close)
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodPost, strings.Replace(path, "/v1/", "/pg/", 1), &body)
			context.Request.Header.Set("Content-Type", contentType)
			t.Cleanup(func() { common.CleanupBodyStorage(context) })
			common.SetContextKey(context, constant.ContextKeyChannelType, constant.ChannelTypeOpenAI)
			common.SetContextKey(context, constant.ContextKeyChannelBaseUrl, server.URL)
			common.SetContextKey(context, constant.ContextKeyOriginalModel, "gpt-image-1")
			common.SetContextKey(context, constant.ContextKeyChannelSetting, dto.ChannelSettings{PassThroughBodyEnabled: !test.globalPassthrough})
			n := uint(1)
			info := &relaycommon.RelayInfo{
				IsPlayground: true, RelayMode: mode, OriginModelName: "gpt-image-1", RequestURLPath: path,
				Request: &dto.ImageRequest{Model: "gpt-image-1", Prompt: "A cup", N: &n, OutputCompression: []byte("0")},
			}
			err := ImageHelper(context, info)
			require.NotNil(t, err)
			require.Equal(t, http.StatusBadRequest, err.StatusCode, err.Error())
			var received upstreamRequest
			select {
			case received = <-requests:
			default:
				t.Fatal("image request did not reach the upstream")
			}
			require.NoError(t, received.err)
			assert.Equal(t, path, received.path)
			if test.multipart {
				request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(received.body))
				request.Header.Set("Content-Type", received.contentType)
				require.NoError(t, request.ParseMultipartForm(1<<20))
				t.Cleanup(func() { require.NoError(t, request.MultipartForm.RemoveAll()) })
				assert.False(t, request.PostForm.Has("group"))
				assert.Equal(t, "0", request.PostForm.Get("output_compression"))
				assert.Len(t, request.MultipartForm.File["image"], 1)
			} else {
				var payload map[string]any
				require.NoError(t, common.Unmarshal(received.body, &payload))
				assert.NotContains(t, payload, "group")
				assert.Equal(t, float64(0), payload["output_compression"])
			}
		})
	}
}
