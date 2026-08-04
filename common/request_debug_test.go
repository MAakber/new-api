package common

import (
	"bytes"
	"fmt"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRequestDebugBodyTrimsIncompleteUTF8TailWhenTruncated(t *testing.T) {
	prefix := []byte(`{"text":"`)
	runeBytes := []byte("😀")
	for _, cut := range []int{1, 2, 3} {
		t.Run(fmt.Sprintf("%d-byte-prefix", cut), func(t *testing.T) {
			payloadPrefix := append(append([]byte{}, prefix...), []byte(strings.Repeat("a", RequestDebugBodyLimit-len(prefix)-cut))...)
			payload := append(payloadPrefix, runeBytes...)

			body := RequestDebugBody(payload, "application/json", false)

			require.Equal(t, string(payloadPrefix), body["body"])
			require.True(t, body["body_truncated"].(bool))
			require.NotContains(t, body, "body_encoding")
		})
	}
}

func TestRequestDebugBodyKeepsBase64ForInvalidOrBinaryTruncatedData(t *testing.T) {
	tests := []struct {
		name        string
		data        []byte
		contentType string
	}{
		{
			name:        "binary",
			data:        append(append(bytes.Repeat([]byte("x"), RequestDebugBodyLimit-1), 0), 'x'),
			contentType: "application/octet-stream",
		},
		{
			name:        "binary with incomplete utf8 suffix",
			data:        append(append(bytes.Repeat([]byte("x"), RequestDebugBodyLimit-1), 0xe4), 'x'),
			contentType: "application/octet-stream",
		},
		{
			name:        "invalid in middle",
			data:        append(append(bytes.Repeat([]byte("x"), RequestDebugBodyLimit/2), 0xff), bytes.Repeat([]byte("y"), RequestDebugBodyLimit)...),
			contentType: "application/json",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body := RequestDebugBody(tt.data, tt.contentType, false)
			require.True(t, body["body_truncated"].(bool))
			require.Equal(t, "base64", body["body_encoding"])
		})
	}
}
