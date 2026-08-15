package controller

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAvatarControllerTest(t *testing.T) (*gorm.DB, string) {
	t.Helper()
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open("file:"+strings.ReplaceAll(t.Name(), "/", "_")+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.UserAvatar{}))
	model.DB = db

	storageRoot := t.TempDir()
	t.Setenv("USER_AVATAR_DIR", storageRoot)
	t.Cleanup(func() { model.DB = previousDB })
	return db, storageRoot
}

func avatarRequest(t *testing.T, method string, body io.Reader, contentType string, userID int) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(method, "/api/user/self/avatar", body)
	context.Request.Header.Set("Content-Type", contentType)
	context.Set("id", userID)
	return context, recorder
}

func adminAvatarRequest(t *testing.T, method string, targetID string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(method, "/api/user/"+targetID+"/avatar", nil)
	context.Params = gin.Params{{Key: "id", Value: targetID}}
	return context, recorder
}

func pngAvatarBytes(t *testing.T, width, height int) []byte {
	t.Helper()
	imageData := image.NewNRGBA(image.Rect(0, 0, width, height))
	imageData.SetNRGBA(0, 0, color.NRGBA{R: 32, G: 64, B: 96, A: 128})
	var encoded bytes.Buffer
	require.NoError(t, png.Encode(&encoded, imageData))
	return encoded.Bytes()
}

func multipartAvatar(t *testing.T, imageData []byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", "profile.png")
	require.NoError(t, err)
	_, err = part.Write(imageData)
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	return &body, writer.FormDataContentType()
}

func TestPutSelfAvatarNormalizesImageAndReplacesPriorObject(t *testing.T) {
	setupAvatarControllerTest(t)

	firstBody, firstContentType := multipartAvatar(t, pngAvatarBytes(t, 8, 4))
	context, recorder := avatarRequest(t, http.MethodPut, firstBody, firstContentType, 7)
	PutSelfAvatar(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "private, no-store", recorder.Header().Get("Cache-Control"))

	firstAvatar, err := model.GetUserAvatar(7)
	require.NoError(t, err)
	require.NotNil(t, firstAvatar)
	assert.Equal(t, service.AvatarContentType, firstAvatar.MimeType)
	assert.Equal(t, 8, firstAvatar.Width)
	assert.Equal(t, 4, firstAvatar.Height)
	assert.EqualValues(t, 1, firstAvatar.Version)
	assert.True(t, strings.HasSuffix(firstAvatar.ObjectKey, ".png"))
	firstObject := firstAvatar.ObjectKey

	file, err := service.NewAvatarStorage().Open(firstObject)
	require.NoError(t, err)
	storedImage, err := png.Decode(file)
	require.NoError(t, file.Close())
	require.NoError(t, err)
	assert.Equal(t, image.Rect(0, 0, 8, 4), storedImage.Bounds())

	secondBody, secondContentType := multipartAvatar(t, pngAvatarBytes(t, 4, 8))
	context, recorder = avatarRequest(t, http.MethodPut, secondBody, secondContentType, 7)
	PutSelfAvatar(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "private, no-store", recorder.Header().Get("Cache-Control"))

	secondAvatar, err := model.GetUserAvatar(7)
	require.NoError(t, err)
	require.NotNil(t, secondAvatar)
	assert.EqualValues(t, 2, secondAvatar.Version)
	assert.NotEqual(t, firstObject, secondAvatar.ObjectKey)
	_, err = service.NewAvatarStorage().Open(firstObject)
	assert.Error(t, err)
}

func TestPutSelfAvatarRejectsInvalidOrOversizedUploads(t *testing.T) {
	setupAvatarControllerTest(t)

	invalidBody, invalidContentType := multipartAvatar(t, []byte("not an image"))
	context, recorder := avatarRequest(t, http.MethodPut, invalidBody, invalidContentType, 8)
	PutSelfAvatar(context)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)

	oversizedBody, oversizedContentType := multipartAvatar(t, bytes.Repeat([]byte{'x'}, maxAvatarBytes+1))
	context, recorder = avatarRequest(t, http.MethodPut, oversizedBody, oversizedContentType, 8)
	PutSelfAvatar(context)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)

	var requestTooLarge bytes.Buffer
	writer := multipart.NewWriter(&requestTooLarge)
	part, err := writer.CreateFormFile("avatar", "profile.png")
	require.NoError(t, err)
	_, err = part.Write(pngAvatarBytes(t, 1, 1))
	require.NoError(t, err)
	extra, err := writer.CreateFormField("padding")
	require.NoError(t, err)
	_, err = extra.Write(bytes.Repeat([]byte{'x'}, maxAvatarRequestBytes))
	require.NoError(t, err)
	require.NoError(t, writer.Close())
	context, recorder = avatarRequest(t, http.MethodPut, &requestTooLarge, writer.FormDataContentType(), 8)
	PutSelfAvatar(context)
	assert.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
}

func TestGetAndDeleteSelfAvatarRespectPrivateMetadata(t *testing.T) {
	_, _ = setupAvatarControllerTest(t)
	storage := service.NewAvatarStorage()
	encoded := pngAvatarBytes(t, 3, 2)
	objectKey, err := storage.Put(9, bytes.NewReader(encoded))
	require.NoError(t, err)
	require.NoError(t, model.SaveUserAvatar(&model.UserAvatar{
		UserID:    9,
		ObjectKey: objectKey,
		MimeType:  service.AvatarContentType,
		Size:      int64(len(encoded)),
		Width:     3,
		Height:    2,
		SHA256:    hex.EncodeToString(make([]byte, 32)),
		Version:   3,
	}))

	context, recorder := avatarRequest(t, http.MethodGet, nil, "", 9)
	GetSelfAvatar(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, service.AvatarContentType, recorder.Header().Get("Content-Type"))
	assert.Equal(t, "private, max-age=86400", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, `"`+hex.EncodeToString(make([]byte, 32))+`"`, recorder.Header().Get("ETag"))
	assert.NotEmpty(t, recorder.Header().Get("Last-Modified"))
	assert.Equal(t, "Authorization, Cookie", recorder.Header().Get("Vary"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))

	context, recorder = avatarRequest(t, http.MethodDelete, nil, "", 9)
	DeleteSelfAvatar(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "private, no-store", recorder.Header().Get("Cache-Control"))
	avatar, err := model.GetUserAvatar(9)
	require.NoError(t, err)
	assert.Nil(t, avatar)
	_, err = storage.Open(objectKey)
	assert.Error(t, err)
}

func TestGetSelfAvatarRejectsUnexpectedMetadata(t *testing.T) {
	setupAvatarControllerTest(t)
	require.NoError(t, model.SaveUserAvatar(&model.UserAvatar{
		UserID:    10,
		ObjectKey: "10/avatar.webp",
		MimeType:  "image/webp",
		Size:      1,
		Width:     1,
		Height:    1,
		SHA256:    hex.EncodeToString(make([]byte, 32)),
		Version:   1,
	}))

	context, recorder := avatarRequest(t, http.MethodGet, nil, "", 10)
	GetSelfAvatar(context)
	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
}

func TestGetAdminUserAvatarServesExistingAvatarWithPrivateHeaders(t *testing.T) {
	db, _ := setupAvatarControllerTest(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	target := model.User{Username: "admin-avatar-target", Password: "password"}
	require.NoError(t, db.Create(&target).Error)

	encoded := pngAvatarBytes(t, 5, 7)
	objectKey, err := service.NewAvatarStorage().Put(target.Id, bytes.NewReader(encoded))
	require.NoError(t, err)
	require.NoError(t, model.SaveUserAvatar(&model.UserAvatar{
		UserID:    target.Id,
		ObjectKey: objectKey,
		MimeType:  service.AvatarContentType,
		Size:      int64(len(encoded)),
		Width:     5,
		Height:    7,
		SHA256:    hex.EncodeToString(make([]byte, 32)),
		Version:   4,
	}))

	context, recorder := adminAvatarRequest(t, http.MethodGet, strconv.Itoa(target.Id))
	GetAdminUserAvatar(context)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, encoded, recorder.Body.Bytes())
	assert.Equal(t, service.AvatarContentType, recorder.Header().Get("Content-Type"))
	assert.Equal(t, "private, max-age=86400", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
}

func TestGetAdminUserAvatarValidatesTargetAndReturnsNotFound(t *testing.T) {
	db, _ := setupAvatarControllerTest(t)
	require.NoError(t, db.AutoMigrate(&model.User{}))

	context, recorder := adminAvatarRequest(t, http.MethodGet, "not-an-id")
	GetAdminUserAvatar(context)
	assert.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Equal(t, "private, max-age=86400", recorder.Header().Get("Cache-Control"))

	context, recorder = adminAvatarRequest(t, http.MethodGet, "9999")
	GetAdminUserAvatar(context)
	assert.Equal(t, http.StatusNotFound, context.Writer.Status())

	target := model.User{Username: "admin-avatar-without-image", Password: "password"}
	require.NoError(t, db.Create(&target).Error)
	context, recorder = adminAvatarRequest(t, http.MethodGet, strconv.Itoa(target.Id))
	GetAdminUserAvatar(context)
	assert.Equal(t, http.StatusNotFound, context.Writer.Status())
}

func TestGetSelfAvatarSupportsConditionalRequestsAndChangesETag(t *testing.T) {
	setupAvatarControllerTest(t)
	storage := service.NewAvatarStorage()
	firstImage := pngAvatarBytes(t, 3, 2)
	firstDigest := sha256.Sum256(firstImage)
	firstUpdatedAt := time.Date(2026, 8, 15, 10, 20, 30, 0, time.UTC)
	firstObjectKey, err := storage.Put(11, bytes.NewReader(firstImage))
	require.NoError(t, err)
	require.NoError(t, model.SaveUserAvatar(&model.UserAvatar{
		UserID:    11,
		ObjectKey: firstObjectKey,
		MimeType:  service.AvatarContentType,
		Size:      int64(len(firstImage)),
		Width:     3,
		Height:    2,
		SHA256:    hex.EncodeToString(firstDigest[:]),
		Version:   1,
		UpdatedAt: firstUpdatedAt,
	}))

	context, recorder := avatarRequest(t, http.MethodGet, nil, "", 11)
	GetSelfAvatar(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	firstETag := recorder.Header().Get("ETag")
	firstLastModified := recorder.Header().Get("Last-Modified")
	require.NotEmpty(t, firstETag)
	require.NotEmpty(t, firstLastModified)

	context, recorder = avatarRequest(t, http.MethodGet, nil, "", 11)
	context.Request.Header.Set("If-None-Match", firstETag)
	GetSelfAvatar(context)
	assert.Equal(t, http.StatusNotModified, context.Writer.Status())
	assert.Empty(t, recorder.Body.Bytes())
	assert.Equal(t, firstETag, recorder.Header().Get("ETag"))
	assert.Equal(t, "private, max-age=86400", recorder.Header().Get("Cache-Control"))

	context, recorder = avatarRequest(t, http.MethodGet, nil, "", 11)
	context.Request.Header.Set("If-Modified-Since", firstLastModified)
	GetSelfAvatar(context)
	assert.Equal(t, http.StatusNotModified, context.Writer.Status())
	assert.Empty(t, recorder.Body.Bytes())

	secondBody, secondContentType := multipartAvatar(t, pngAvatarBytes(t, 4, 2))
	context, recorder = avatarRequest(t, http.MethodPut, secondBody, secondContentType, 11)
	PutSelfAvatar(context)
	require.Equal(t, http.StatusOK, recorder.Code)

	context, recorder = avatarRequest(t, http.MethodGet, nil, "", 11)
	GetSelfAvatar(context)
	require.Equal(t, http.StatusOK, recorder.Code)
	assert.NotEqual(t, firstETag, recorder.Header().Get("ETag"))
}
