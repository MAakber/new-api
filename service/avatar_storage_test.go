package service

import (
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLocalAvatarStorageUsesGeneratedKeysAndAtomicFiles(t *testing.T) {
	root := t.TempDir()
	storage := NewLocalAvatarStorage(root)

	key, err := storage.Put(42, strings.NewReader("avatar-data"))
	require.NoError(t, err)
	assert.True(t, strings.HasPrefix(key, "42/"))
	assert.True(t, strings.HasSuffix(key, ".png"))
	assert.NotContains(t, key, "avatar-data")

	file, err := storage.Open(key)
	require.NoError(t, err)
	data, err := io.ReadAll(file)
	require.NoError(t, file.Close())
	require.NoError(t, err)
	assert.Equal(t, []byte("avatar-data"), data)

	entries, err := os.ReadDir(filepath.Join(root, "42"))
	require.NoError(t, err)
	require.Len(t, entries, 1)
	assert.False(t, strings.HasPrefix(entries[0].Name(), ".avatar-"))

	require.Error(t, storage.Delete("../outside.webp"))
	require.NoError(t, storage.Delete(key))
	require.NoError(t, storage.Delete(key))
}

func TestNewLocalAvatarStorageUsesContainerDataDirectory(t *testing.T) {
	t.Setenv("USER_AVATAR_DIR", "")
	originalWorkingDirectory, err := os.Getwd()
	require.NoError(t, err)
	dataDirectory := filepath.Join(t.TempDir(), "data")
	require.NoError(t, os.Mkdir(dataDirectory, 0750))
	require.NoError(t, os.Chdir(dataDirectory))
	t.Cleanup(func() { require.NoError(t, os.Chdir(originalWorkingDirectory)) })

	storage := NewLocalAvatarStorage("")
	assert.Equal(t, filepath.Join(dataDirectory, "avatars"), storage.root)
}
