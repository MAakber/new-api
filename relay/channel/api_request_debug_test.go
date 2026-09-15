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
	"github.com/QuantumNous/new-api/model"
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
			responseBody, err := io.ReadAll(response.Body)
			require.NoError(t, err)
			assert.Equal(t, "ok", string(responseBody))
			encoded, err := common2.Marshal(common2.GetContextKeyStringMap(ctx, constant.ContextKeyRequestDebug))
			require.NoError(t, err)
			var debug map[string]map[string]any
			require.NoError(t, common2.Unmarshal(encoded, &debug))
			upstream := debug["upstream"]
			if rawEnabled {
				assert.Equal(t, string(payload), upstream["body"])
				assert.Equal(t, false, upstream["body_truncated"])
				assert.Equal(t, "ok", debug["response"]["body"])
				assert.Equal(t, false, debug["response"]["body_truncated"])
			} else {
				assert.NotContains(t, upstream, "body")
				assert.NotContains(t, debug["response"], "body")
			}
		})
	}
}

type requestDebugResponseBody struct {
	*strings.Reader
	readErr  error
	closeErr error
	closed   bool
}

func (r *requestDebugResponseBody) Read(p []byte) (int, error) {
	n, err := r.Reader.Read(p)
	if r.Len() == 0 && r.readErr != nil {
		return n, r.readErr
	}
	return n, err
}

func (r *requestDebugResponseBody) Close() error {
	r.closed = true
	return r.closeErr
}

func TestRequestDebugResponsePreservesStreamAndCapturesPreview(t *testing.T) {
	service.InitHttpClient()
	client := service.GetHttpClient()
	previousTransport := client.Transport
	previousRaw := common2.IsRequestDebugRawEnabled()
	common2.SetRequestDebugRawEnabled(true)
	t.Cleanup(func() {
		client.Transport = previousTransport
		common2.SetRequestDebugRawEnabled(previousRaw)
	})

	tests := []struct {
		name          string
		payload       string
		contentType   string
		contentLength int64
		status        int
		readErr       error
		wantBody      string
		wantEncoding  string
		wantTruncated bool
	}{
		{
			name: "upstream error", payload: `{"error":"upstream unavailable"}`,
			contentType: "application/json", contentLength: 32, status: http.StatusBadGateway,
			wantBody: `{"error":"upstream unavailable"}`,
		},
		{
			name: "SSE", payload: "data: {\"text\":\"hello\"}\n\ndata: [DONE]\n\n",
			contentType: "text/event-stream", contentLength: -1, status: http.StatusOK,
			wantBody: "data: {\"text\":\"hello\"}\n\ndata: [DONE]\n\n",
		},
		{
			name: "bounded preview", payload: strings.Repeat("x", common2.RequestDebugBodyLimit+1),
			contentType: "text/plain", contentLength: -1, status: http.StatusOK,
			wantBody: strings.Repeat("x", common2.RequestDebugBodyLimit), wantTruncated: true,
		},
		{
			name: "binary", payload: "\x00\xff", contentType: "application/octet-stream",
			contentLength: 2, status: http.StatusOK, wantBody: "AP8=", wantEncoding: "base64",
		},
		{
			name: "interrupted response", payload: "partial", contentType: "text/plain",
			contentLength: -1, status: http.StatusOK, readErr: io.ErrUnexpectedEOF,
			wantBody: "partial", wantTruncated: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := &requestDebugResponseBody{
				Reader: strings.NewReader(tt.payload), readErr: tt.readErr, closeErr: io.ErrClosedPipe,
			}
			client.Transport = requestDebugTransportFunc(func(req *http.Request) (*http.Response, error) {
				return &http.Response{
					StatusCode: tt.status, Proto: "HTTP/2.0", Body: body, Request: req,
					Header: http.Header{"Content-Type": {tt.contentType}}, ContentLength: tt.contentLength,
				}, nil
			})
			req, err := http.NewRequest(http.MethodPost, "http://upstream.test/v1/chat/completions", strings.NewReader("request body"))
			require.NoError(t, err)
			ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
			ctx.Request = httptest.NewRequest(http.MethodPost, "/relay", strings.NewReader("request body"))
			response, err := doRequest(ctx, req, &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{}})
			require.NoError(t, err)
			assert.Equal(t, len(tt.payload), body.Len(), "response capture must not read ahead")
			assert.Equal(t, tt.status, response.StatusCode)

			if tt.contentType == "text/event-stream" {
				prefix := make([]byte, 5)
				_, err = io.ReadFull(response.Body, prefix)
				require.NoError(t, err)
				assert.Equal(t, tt.payload[:5], string(prefix))
				encoded, marshalErr := common2.Marshal(common2.GetContextKeyStringMap(ctx, constant.ContextKeyRequestDebug))
				require.NoError(t, marshalErr)
				var debug map[string]map[string]any
				require.NoError(t, common2.Unmarshal(encoded, &debug))
				assert.Equal(t, string(prefix), debug["response"]["body"])
				assert.Equal(t, true, debug["response"]["body_truncated"])
				assert.Equal(t, false, debug["response"]["body_bytes_known"])
			}

			remaining, readErr := io.ReadAll(response.Body)
			require.ErrorIs(t, readErr, tt.readErr)
			wantRemaining := tt.payload
			if tt.contentType == "text/event-stream" {
				wantRemaining = tt.payload[5:]
			}
			assert.Equal(t, wantRemaining, string(remaining))
			other := model.NewLogOther()
			other.SetAdmin("request_debug", common2.GetContextKeyStringMap(ctx, constant.ContextKeyRequestDebug))
			var stored struct {
				AdminInfo struct {
					RequestDebug map[string]map[string]any `json:"request_debug"`
				} `json:"admin_info"`
			}
			require.NoError(t, common2.UnmarshalJsonStr(other.JSONString(), &stored))
			debug := stored.AdminInfo.RequestDebug["response"]
			assert.Equal(t, tt.wantBody, debug["body"])
			assert.Equal(t, tt.wantTruncated, debug["body_truncated"])
			assert.Equal(t, float64(len(tt.payload)), debug["body_bytes"])
			assert.Equal(t, tt.readErr == nil, debug["body_bytes_known"])
			if tt.wantEncoding != "" {
				assert.Equal(t, tt.wantEncoding, debug["body_encoding"])
			} else {
				assert.NotContains(t, debug, "body_encoding")
			}
			assert.ErrorIs(t, response.Body.Close(), body.closeErr)
			assert.True(t, body.closed, "closing the capture must close the upstream body")
		})
	}
}
