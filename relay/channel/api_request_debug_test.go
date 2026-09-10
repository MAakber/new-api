package channel

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	common2 "github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRequestDebugCapturePreservesRequestStreamAndBoundsBody(t *testing.T) {
	payload := strings.Repeat("x", common2.RequestDebugBodyLimit+1)
	capture := &requestDebugCaptureReadCloser{ReadCloser: io.NopCloser(strings.NewReader(payload))}
	read, err := io.ReadAll(capture)
	require.NoError(t, err)
	require.Equal(t, payload, string(read), "capture must not alter the upstream request stream")

	body := capture.debugBody("text/plain", int64(len(payload)))
	require.Len(t, body["body"].(string), common2.RequestDebugBodyLimit)
	require.True(t, body["body_truncated"].(bool))
}

type requestDebugTransportFunc func(*http.Request) (*http.Response, error)

func (f requestDebugTransportFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestRequestDebugCaptureUsesReplayedBodyAndHonorsRawSetting(t *testing.T) {
	service.InitHttpClient()
	client := service.GetHttpClient()
	previousTransport := client.Transport
	previousRaw := common2.IsRequestDebugRawEnabled()
	t.Cleanup(func() {
		client.Transport = previousTransport
		common2.SetRequestDebugRawEnabled(previousRaw)
	})

	for _, rawEnabled := range []bool{true, false} {
		name := "raw disabled"
		if rawEnabled {
			name = "raw enabled"
		}
		t.Run(name, func(t *testing.T) {
			common2.SetRequestDebugRawEnabled(rawEnabled)
			payload := []byte("complete replay request")
			storage, err := common2.CreateBodyStorage(payload)
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, storage.Close()) })
			body := common2.NewReplayableBodyReader(storage)
			req, err := http.NewRequest(http.MethodPost, "http://upstream.test/v1/chat/completions", body)
			require.NoError(t, err)
			req.Header.Set("Content-Type", "text/plain")
			ApplyUpstreamBodyMetadata(req, body)
			var replayed []byte
			client.Transport = requestDebugTransportFunc(func(request *http.Request) (*http.Response, error) {
				prefix := make([]byte, 3)
				if _, readErr := io.ReadFull(request.Body, prefix); readErr != nil {
					return nil, readErr
				}
				_ = request.Body.Close()
				replay, replayErr := request.GetBody()
				if replayErr != nil {
					return nil, replayErr
				}
				defer replay.Close()
				replayed, replayErr = io.ReadAll(replay)
				if replayErr != nil {
					return nil, replayErr
				}
				return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader("ok")), Request: request}, nil
			})
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/relay", bytes.NewReader(payload))
			response, err := doRequest(ctx, req, &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}})
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, response.Body.Close()) })
			assert.Equal(t, payload, replayed)
			debug := common2.GetContextKeyStringMap(ctx, constant.ContextKeyRequestDebug)
			upstream, ok := debug["upstream"].(map[string]interface{})
			require.True(t, ok)
			if rawEnabled {
				assert.Equal(t, string(payload), upstream["body"])
				assert.Equal(t, false, upstream["body_truncated"])
			} else {
				assert.NotContains(t, upstream, "body")
			}
		})
	}
}
