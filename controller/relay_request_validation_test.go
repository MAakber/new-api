package controller

import (
	"bytes"
	"compress/gzip"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/andybalholm/brotli"
	"github.com/gin-gonic/gin"
	"github.com/klauspost/compress/zstd"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRelayReturnsClientErrorsForInvalidAndOversizedCompressedBodies(t *testing.T) {
	originalLimit := constant.MaxRequestBodyMB
	constant.MaxRequestBodyMB = 1
	t.Cleanup(func() { constant.MaxRequestBodyMB = originalLimit })

	for _, encoding := range []string{"identity", "gzip", "br", "zstd"} {
		for _, tt := range []struct {
			name   string
			body   string
			status int
		}{
			{"invalid JSON", `{"model":`, http.StatusBadRequest},
			{"decompressed size exceeds limit", `{}` + strings.Repeat(" ", 1<<20), http.StatusRequestEntityTooLarge},
		} {
			t.Run(encoding+"/"+tt.name, func(t *testing.T) {
				var body bytes.Buffer
				switch encoding {
				case "gzip":
					writer := gzip.NewWriter(&body)
					_, err := writer.Write([]byte(tt.body))
					require.NoError(t, err)
					require.NoError(t, writer.Close())
				case "br":
					writer := brotli.NewWriter(&body)
					_, err := writer.Write([]byte(tt.body))
					require.NoError(t, err)
					require.NoError(t, writer.Close())
				case "zstd":
					writer, err := zstd.NewWriter(&body)
					require.NoError(t, err)
					_, err = writer.Write([]byte(tt.body))
					require.NoError(t, err)
					require.NoError(t, writer.Close())
				default:
					body.WriteString(tt.body)
				}
				engine := gin.New()
				engine.Use(middleware.DecompressRequestMiddleware(), middleware.BodyStorageCleanup())
				engine.POST("/v1/chat/completions", func(c *gin.Context) { Relay(c, types.RelayFormatOpenAI) })
				request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", &body)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Content-Encoding", encoding)
				response := httptest.NewRecorder()
				engine.ServeHTTP(response, request)
				assert.Equal(t, tt.status, response.Code, response.Body.String())
				require.NoError(t, request.Body.Close())
			})
		}
	}
}
