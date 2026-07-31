package channel

import (
	"io"
	"strings"
	"testing"

	common2 "github.com/QuantumNous/new-api/common"
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
