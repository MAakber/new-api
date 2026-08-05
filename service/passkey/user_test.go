package passkey

import (
	"encoding/base64"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWebAuthnUserExposesEveryRegisteredCredential(t *testing.T) {
	firstID := []byte("credential-a")
	secondID := []byte("credential-b")
	user := NewWebAuthnUser(&model.User{Id: 42, Username: "multi-device"}, []model.PasskeyCredential{
		{CredentialID: base64.StdEncoding.EncodeToString(firstID), PublicKey: base64.StdEncoding.EncodeToString([]byte("key-a"))},
		{CredentialID: base64.StdEncoding.EncodeToString(secondID), PublicKey: base64.StdEncoding.EncodeToString([]byte("key-b"))},
	})

	credentials := user.WebAuthnCredentials()
	require.Len(t, credentials, 2)
	assert.Equal(t, firstID, credentials[0].ID)
	assert.Equal(t, secondID, credentials[1].ID)
}
