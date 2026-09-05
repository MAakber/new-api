package oauth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLinuxDOProviderGetUserInfoReadsAvatarURL(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		assert.Equal(t, "Bearer access-token", request.Header.Get("Authorization"))
		writer.Header().Set("Content-Type", "application/json")
		_, err := writer.Write([]byte(`{"id":42,"username":"linux-user","name":"Linux User","avatar_url":"https://cdn.example/avatar.png","trust_level":1}`))
		require.NoError(t, err)
	}))
	defer server.Close()

	t.Setenv("LINUX_DO_USER_ENDPOINT", server.URL)
	previousTrustLevel := common.LinuxDOMinimumTrustLevel
	common.LinuxDOMinimumTrustLevel = 0
	t.Cleanup(func() { common.LinuxDOMinimumTrustLevel = previousTrustLevel })

	user, err := (&LinuxDOProvider{}).GetUserInfo(context.Background(), &OAuthToken{AccessToken: "access-token"})

	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "42", user.ProviderUserID)
	assert.Equal(t, "https://cdn.example/avatar.png", user.AvatarURL)
}

func TestGenericOAuthProviderGetUserInfoReadsStandardAvatarFields(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, err := writer.Write([]byte(`{"sub":"generic-user","preferred_username":"generic","name":"Generic User","email":"user@example.com","picture":"https://cdn.example/picture.png"}`))
		require.NoError(t, err)
	}))
	defer server.Close()

	provider := NewGenericOAuthProvider(&model.CustomOAuthProvider{
		Slug:             "generic-test",
		UserInfoEndpoint: server.URL,
		UserIdField:      "sub",
		UsernameField:    "preferred_username",
		DisplayNameField: "name",
		EmailField:       "email",
	})
	user, err := provider.GetUserInfo(context.Background(), &OAuthToken{AccessToken: "access-token"})

	require.NoError(t, err)
	require.NotNil(t, user)
	assert.Equal(t, "https://cdn.example/picture.png", user.AvatarURL)
}
