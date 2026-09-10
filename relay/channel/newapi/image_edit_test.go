package newapi

import (
	"bytes"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewAPIImageEditsPreserveMultipartAndPlaygroundRouting(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, test := range []struct {
		name       string
		playground bool
	}{
		{name: "API edits"},
		{name: "drawing workspace edits", playground: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			var body bytes.Buffer
			writer := multipart.NewWriter(&body)
			for key, value := range map[string]string{
				"model": "public-image-alias", "group": "premium", "prompt": "Recolor the cup",
				"stream": "true", "partial_images": "0", "output_compression": "0",
			} {
				require.NoError(t, writer.WriteField(key, value))
			}
			for _, field := range []string{"image", "mask"} {
				part, err := writer.CreateFormFile(field, field+".png")
				require.NoError(t, err)
				_, err = io.WriteString(part, field+"-bytes")
				require.NoError(t, err)
			}
			require.NoError(t, writer.Close())
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &body)
			context.Request.Header.Set("Content-Type", writer.FormDataContentType())
			t.Cleanup(func() { common.CleanupBodyStorage(context) })
			info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits, IsPlayground: test.playground}

			converted, err := (&Adaptor{}).ConvertImageRequest(context, info, dto.ImageRequest{Model: "gpt-image-1"})
			require.NoError(t, err)
			outgoing, ok := converted.(*bytes.Buffer)
			require.True(t, ok, "image edits must stay multipart instead of becoming a JSON DTO")
			request := httptest.NewRequest(http.MethodPost, "/v1/images/edits", outgoing)
			request.Header.Set("Content-Type", context.Request.Header.Get("Content-Type"))
			require.NoError(t, request.ParseMultipartForm(1<<20))
			t.Cleanup(func() { require.NoError(t, request.MultipartForm.RemoveAll()) })
			assert.Equal(t, "gpt-image-1", request.PostForm.Get("model"))
			assert.Equal(t, "true", request.PostForm.Get("stream"))
			assert.Equal(t, "0", request.PostForm.Get("partial_images"))
			assert.Equal(t, "0", request.PostForm.Get("output_compression"))
			assert.Equal(t, !test.playground, request.PostForm.Has("group"))
			assert.Equal(t, "premium", context.Request.PostForm.Get("group"))
			for _, field := range []string{"image", "mask"} {
				require.Len(t, request.MultipartForm.File[field], 1)
				file, err := request.MultipartForm.File[field][0].Open()
				require.NoError(t, err)
				content, err := io.ReadAll(file)
				require.NoError(t, err)
				require.NoError(t, file.Close())
				assert.Equal(t, field+"-bytes", string(content))
			}
		})
	}
}

func TestNewAPIImageGenerationKeepsExplicitZeroFields(t *testing.T) {
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	request := dto.ImageRequest{Model: "gpt-image-1", Prompt: "Draw a cup", PartialImages: []byte("0"), Stream: common.GetPointer(false)}
	converted, err := (&Adaptor{}).ConvertImageRequest(context, &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesGenerations}, request)
	require.NoError(t, err)
	encoded, err := common.Marshal(converted)
	require.NoError(t, err)
	assert.JSONEq(t, `{"model":"gpt-image-1","prompt":"Draw a cup","partial_images":0,"stream":false}`, string(encoded))
}
