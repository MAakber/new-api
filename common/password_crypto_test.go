package common

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPasswordEncryptionProtocol(t *testing.T) {
	passwordEncryptionState.RLock()
	oldPrivate, oldPublic, oldID := passwordEncryptionState.privateKey, passwordEncryptionState.publicKey, passwordEncryptionState.keyID
	passwordEncryptionState.RUnlock()
	t.Cleanup(func() {
		passwordEncryptionState.Lock()
		passwordEncryptionState.privateKey, passwordEncryptionState.publicKey, passwordEncryptionState.keyID = oldPrivate, oldPublic, oldID
		passwordEncryptionState.Unlock()
	})

	privatePEM, err := GeneratePasswordEncryptionPrivateKey()
	require.NoError(t, err)
	require.NoError(t, LoadPasswordEncryptionPrivateKey(privatePEM))
	keyID, publicPEM := PasswordEncryptionPublicKey()
	block, _ := pem.Decode([]byte(publicPEM))
	require.NotNil(t, block)
	parsed, err := x509.ParsePKIXPublicKey(block.Bytes)
	require.NoError(t, err)
	publicKey, ok := parsed.(*rsa.PublicKey)
	require.True(t, ok)
	const password = "correct-密码-🔐"
	ciphertext, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, []byte(password), nil)
	require.NoError(t, err)
	encoded := base64.StdEncoding.EncodeToString(ciphertext)
	actual, err := DecryptPassword(encoded, keyID)
	require.NoError(t, err)
	assert.Equal(t, password, actual)

	wrongHash, err := rsa.EncryptOAEP(sha1.New(), rand.Reader, publicKey, []byte(password), nil)
	require.NoError(t, err)
	empty, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, publicKey, nil, nil)
	require.NoError(t, err)
	for _, tc := range []struct{ name, ciphertext, keyID string }{
		{"stale key", encoded, "previous-key"},
		{"missing key", encoded, ""},
		{"invalid base64", "not base64!", keyID},
		{"truncated payload", base64.StdEncoding.EncodeToString(ciphertext[:10]), keyID},
		{"wrong hash", base64.StdEncoding.EncodeToString(wrongHash), keyID},
		{"empty password", base64.StdEncoding.EncodeToString(empty), keyID},
	} {
		t.Run(tc.name, func(t *testing.T) {
			actual, err := DecryptPassword(tc.ciphertext, tc.keyID)
			assert.ErrorIs(t, err, ErrPasswordEncryptionInvalid)
			assert.Empty(t, actual)
		})
	}

	t.Run("invalid replacement leaves the active key usable", func(t *testing.T) {
		require.Error(t, LoadPasswordEncryptionPrivateKey("corrupt key"))
		actual, err := DecryptPassword(encoded, keyID)
		require.NoError(t, err)
		assert.Equal(t, password, actual)
	})
}
