package middleware

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
	"github.com/QuantumNous/new-api/i18n"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func playgroundImageRequest(t *testing.T, path string, multipartBody bool, group string) *http.Request {
	t.Helper()
	if !multipartBody {
		body, err := common.Marshal(map[string]any{
			"model": "gpt-image-1", "group": group, "prompt": "A ceramic cup",
			"n": 2, "stream": true, "output_compression": 0, "partial_images": 0,
		})
		require.NoError(t, err)
		request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		return request
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range map[string]string{
		"model": "gpt-image-1", "group": group, "prompt": "A ceramic cup",
		"n": "2", "stream": "true", "output_compression": "0", "partial_images": "0",
	} {
		require.NoError(t, writer.WriteField(key, value))
	}
	image, err := writer.CreateFormFile("image", "cup.png")
	require.NoError(t, err)
	_, err = io.WriteString(image, "reference-image")
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	request := httptest.NewRequest(http.MethodPost, path, &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	return request
}

func TestPlaygroundImageModelSelectionPreservesBodyForRelay(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, test := range []struct {
		name, path string
		multipart  bool
		mode       int
	}{
		{"generate JSON", "/pg/images/generations", false, relayconstant.RelayModeImagesGenerations},
		{"edit JSON", "/pg/images/edits", false, relayconstant.RelayModeImagesEdits},
		{"edit multipart", "/pg/images/edits", true, relayconstant.RelayModeImagesEdits},
	} {
		t.Run(test.name, func(t *testing.T) {
			context, _ := gin.CreateTestContext(httptest.NewRecorder())
			context.Request = playgroundImageRequest(t, test.path, test.multipart, "premium")
			t.Cleanup(func() { common.CleanupBodyStorage(context) })

			request, selectChannel, err := getModelRequest(context)
			require.NoError(t, err)
			assert.True(t, selectChannel)
			assert.Equal(t, "gpt-image-1", request.Model)
			assert.Equal(t, "premium", request.Group)
			assert.Equal(t, "premium", common.GetContextKeyString(context, constant.ContextKeyTokenGroup))
			mode := relayconstant.Path2RelayMode(test.path)
			assert.Equal(t, test.mode, mode)

			imageRequest, err := helper.GetAndValidOpenAIImageRequest(context, mode)
			require.NoError(t, err)
			assert.Equal(t, "A ceramic cup", imageRequest.Prompt)
			require.NotNil(t, imageRequest.N)
			assert.Equal(t, uint(2), *imageRequest.N)
			require.NotNil(t, imageRequest.Stream)
			assert.True(t, *imageRequest.Stream)
			if test.multipart {
				require.Len(t, context.Request.MultipartForm.File["image"], 1)
				assert.Equal(t, "0", context.Request.PostForm.Get("output_compression"))
			} else {
				assert.Equal(t, "0", string(imageRequest.OutputCompression))
			}
		})
	}
}

func TestPlaygroundImagesRejectUnauthorizedGroupBeforeChannelSelection(t *testing.T) {
	require.NoError(t, i18n.Init())
	previous := setting.UserUsableGroups2JSONString()
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString("{\"default\":\"Default\"}"))
	t.Cleanup(func() { require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previous)) })
	gin.SetMode(gin.TestMode)
	for _, path := range []string{"/pg/chat/completions", "/pg/images/generations", "/pg/images/edits"} {
		t.Run(path, func(t *testing.T) {
			router := gin.New()
			router.POST(path, func(c *gin.Context) {
				common.SetContextKey(c, constant.ContextKeyUsingGroup, "default")
				c.Next()
			}, Distribute(), func(c *gin.Context) { t.Error("unauthorized request reached relay"); c.Status(http.StatusOK) })
			response := httptest.NewRecorder()
			router.ServeHTTP(response, playgroundImageRequest(t, path, strings.HasSuffix(path, "/edits"), "private-test-group"))
			assert.Equal(t, http.StatusForbidden, response.Code)
		})
	}
}
