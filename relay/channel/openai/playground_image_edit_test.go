package openai

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

func TestPlaygroundImageEditOmitsRoutingGroupAndPreservesOpenAIParameters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"model": "gpt-image-1", "group": "premium", "prompt": "Recolor the cup",
		"output_compression": "0", "partial_images": "0", "stream": "true",
		"input_fidelity": "high", "background": "transparent", "output_format": "webp",
	} {
		require.NoError(t, writer.WriteField(key, value))
	}
	for _, field := range []string{"image", "mask"} {
		part, err := writer.CreateFormFile(field, field+".png")
		require.NoError(t, err)
		_, err = io.WriteString(part, field+"-content")
		require.NoError(t, err)
	}
	require.NoError(t, writer.Close())
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/pg/images/edits", &body)
	context.Request.Header.Set("Content-Type", writer.FormDataContentType())
	t.Cleanup(func() { common.CleanupBodyStorage(context) })
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits, IsPlayground: true}
	converted, err := (&Adaptor{}).ConvertImageRequest(context, info, dto.ImageRequest{Model: "gpt-image-1"})
	require.NoError(t, err)
	outgoing, ok := converted.(*bytes.Buffer)
	require.True(t, ok)
	request := httptest.NewRequest(http.MethodPost, "/v1/images/edits", outgoing)
	request.Header.Set("Content-Type", context.Request.Header.Get("Content-Type"))
	require.NoError(t, request.ParseMultipartForm(1<<20))
	t.Cleanup(func() { require.NoError(t, request.MultipartForm.RemoveAll()) })
	assert.False(t, request.PostForm.Has("group"))
	assert.Equal(t, "premium", context.Request.PostForm.Get("group"))
	assert.Equal(t, "0", request.PostForm.Get("output_compression"))
	assert.Equal(t, "0", request.PostForm.Get("partial_images"))
	assert.Equal(t, "high", request.PostForm.Get("input_fidelity"))
	assert.Equal(t, "transparent", request.PostForm.Get("background"))
	assert.Equal(t, "webp", request.PostForm.Get("output_format"))
	assert.Len(t, request.MultipartForm.File["image"], 1)
	assert.Len(t, request.MultipartForm.File["mask"], 1)
}
