package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/oauth"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupOAuthAvatarImportTest(t *testing.T, handler http.Handler) *httptest.Server {
	t.Helper()
	setupAvatarControllerTest(t)
	server := httptest.NewServer(handler)
	fetchSetting := system_setting.GetFetchSetting()
	previousFetchSetting := *fetchSetting
	previousFactory := oauthAvatarHTTPClientFactory
	fetchSetting.EnableSSRFProtection = true
	fetchSetting.AllowPrivateIp = true
	fetchSetting.DomainFilterMode = false
	fetchSetting.IpFilterMode = false
	fetchSetting.DomainList = nil
	fetchSetting.IpList = nil
	fetchSetting.AllowedPorts = nil
	fetchSetting.ApplyIPFilterForDomain = true
	oauthAvatarHTTPClientFactory = func() *http.Client { return server.Client() }
	t.Cleanup(func() {
		oauthAvatarHTTPClientFactory = previousFactory
		*fetchSetting = previousFetchSetting
		server.Close()
	})
	return server
}

func TestImportOAuthAvatarNormalizesAndStoresImage(t *testing.T) {
	imageData := pngAvatarBytes(t, 1024, 512)
	server := setupOAuthAvatarImportTest(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		assert.Equal(t, "/avatar.png", request.URL.Path)
		writer.Header().Set("Content-Type", "image/png")
		_, err := writer.Write(imageData)
		require.NoError(t, err)
	}))

	importOAuthAvatar(context.Background(), 21, server.URL+"/avatar.png")

	avatar, err := model.GetUserAvatar(21)
	require.NoError(t, err)
	require.NotNil(t, avatar)
	assert.Equal(t, service.AvatarContentType, avatar.MimeType)
	assert.Equal(t, 512, avatar.Width)
	assert.Equal(t, 256, avatar.Height)
	assert.EqualValues(t, 1, avatar.Version)
	assert.Greater(t, avatar.Size, int64(0))
	assert.LessOrEqual(t, avatar.Size, int64(service.AvatarMaxBytes))

	file, err := service.NewAvatarStorage().Open(avatar.ObjectKey)
	require.NoError(t, err)
	storedImage, err := png.Decode(file)
	require.NoError(t, file.Close())
	require.NoError(t, err)
	assert.Equal(t, 512, storedImage.Bounds().Dx())
	assert.Equal(t, 256, storedImage.Bounds().Dy())
}

func TestImportOAuthAvatarFailureDoesNotCreateAvatar(t *testing.T) {
	server := setupOAuthAvatarImportTest(t, http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusBadGateway)
	}))

	importOAuthAvatar(context.Background(), 22, server.URL+"/avatar.png")

	avatar, err := model.GetUserAvatar(22)
	require.NoError(t, err)
	assert.Nil(t, avatar)
}

func TestImportOAuthAvatarDoesNotOverwriteExistingAvatar(t *testing.T) {
	firstImage := pngAvatarBytes(t, 8, 4)
	requests := 0
	server := setupOAuthAvatarImportTest(t, http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requests++
		_, err := writer.Write(pngAvatarBytes(t, 4, 8))
		require.NoError(t, err)
	}))

	storage := service.NewAvatarStorage()
	objectKey, err := storage.Put(23, bytes.NewReader(firstImage))
	require.NoError(t, err)
	digest := sha256.Sum256(firstImage)
	require.NoError(t, model.SaveUserAvatar(&model.UserAvatar{
		UserID:    23,
		ObjectKey: objectKey,
		MimeType:  service.AvatarContentType,
		Size:      int64(len(firstImage)),
		Width:     8,
		Height:    4,
		SHA256:    hex.EncodeToString(digest[:]),
		Version:   4,
	}))

	importOAuthAvatar(context.Background(), 23, server.URL+"/avatar.png")

	avatar, err := model.GetUserAvatar(23)
	require.NoError(t, err)
	require.NotNil(t, avatar)
	assert.Equal(t, objectKey, avatar.ObjectKey)
	assert.EqualValues(t, 4, avatar.Version)
	assert.Zero(t, requests)
}

func TestPendingOAuthRegistrationRetainsValidatedAvatarURL(t *testing.T) {
	setupRegistrationCompletionTest(t)
	provider := &authFlowTestOAuthProvider{}
	avatarURL := "https://cdn.example/avatar.png"

	user, challenge, err := findOrCreateOAuthUser("auth-flow-test", provider, &oauth.OAuthUser{
		ProviderUserID: "pending-avatar-user",
		Username:       "pending-avatar-user",
		AvatarURL:      avatarURL,
	}, "")

	require.NoError(t, err)
	assert.Nil(t, user)
	require.NotNil(t, challenge)
	flow, err := model.GetAuthFlow(challenge.FlowToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeRegistration})
	require.NoError(t, err)
	var payload pendingRegistrationPayload
	require.NoError(t, common.UnmarshalJsonStr(flow.Payload, &payload))
	assert.Equal(t, avatarURL, payload.AvatarURL)
}
