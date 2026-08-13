package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
)

const defaultAvatarDirectory = "data/avatars"

// AvatarStorage stores avatar objects without exposing client-controlled
// filenames or paths.
type AvatarStorage interface {
	Put(userID int, source io.Reader) (objectKey string, err error)
	Open(objectKey string) (io.ReadCloser, error)
	Delete(objectKey string) error
}

// LocalAvatarStorage stores avatars below a single local directory.
type LocalAvatarStorage struct {
	root string
}

func NewLocalAvatarStorage(root string) *LocalAvatarStorage {
	if strings.TrimSpace(root) == "" {
		root = strings.TrimSpace(os.Getenv("USER_AVATAR_DIR"))
	}
	if root == "" {
		workingDirectory, err := os.Getwd()
		if err == nil && filepath.Base(workingDirectory) == "data" {
			root = filepath.Join(workingDirectory, "avatars")
		} else {
			root = defaultAvatarDirectory
		}
	}
	return &LocalAvatarStorage{root: root}
}

func NewAvatarStorage() AvatarStorage {
	return NewLocalAvatarStorage("")
}

func (s *LocalAvatarStorage) Put(userID int, source io.Reader) (string, error) {
	if s == nil || strings.TrimSpace(s.root) == "" {
		return "", errors.New("avatar storage root is required")
	}
	if userID <= 0 {
		return "", errors.New("user ID is required")
	}
	if source == nil {
		return "", errors.New("avatar source is required")
	}

	userDirectory := filepath.Join(s.root, strconv.Itoa(userID))
	if err := os.MkdirAll(userDirectory, 0750); err != nil {
		return "", fmt.Errorf("create avatar directory: %w", err)
	}

	var randomKey [16]byte
	if _, err := io.ReadFull(rand.Reader, randomKey[:]); err != nil {
		return "", fmt.Errorf("generate avatar object key: %w", err)
	}
	filename := hex.EncodeToString(randomKey[:]) + ".png"
	temporary, err := os.CreateTemp(userDirectory, ".avatar-*")
	if err != nil {
		return "", fmt.Errorf("create avatar temporary file: %w", err)
	}
	temporaryName := temporary.Name()
	removeTemporary := true
	defer func() {
		_ = temporary.Close()
		if removeTemporary {
			_ = os.Remove(temporaryName)
		}
	}()

	if _, err := io.Copy(temporary, source); err != nil {
		return "", fmt.Errorf("write avatar object: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return "", fmt.Errorf("sync avatar object: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return "", fmt.Errorf("close avatar object: %w", err)
	}

	objectKey := strconv.Itoa(userID) + "/" + filename
	if err := os.Rename(temporaryName, filepath.Join(userDirectory, filename)); err != nil {
		return "", fmt.Errorf("commit avatar object: %w", err)
	}
	removeTemporary = false
	return objectKey, nil
}

func (s *LocalAvatarStorage) Open(objectKey string) (io.ReadCloser, error) {
	objectPath, err := s.objectPath(objectKey)
	if err != nil {
		return nil, err
	}
	return os.Open(objectPath)
}

func (s *LocalAvatarStorage) Delete(objectKey string) error {
	objectPath, err := s.objectPath(objectKey)
	if err != nil {
		return err
	}
	if err := os.Remove(objectPath); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *LocalAvatarStorage) objectPath(objectKey string) (string, error) {
	if s == nil || strings.TrimSpace(s.root) == "" {
		return "", errors.New("avatar storage root is required")
	}
	if objectKey == "" || strings.Contains(objectKey, "\\") || path.IsAbs(objectKey) {
		return "", errors.New("invalid avatar object key")
	}
	cleanKey := path.Clean(objectKey)
	if cleanKey == "." || cleanKey == ".." || strings.HasPrefix(cleanKey, "../") || cleanKey != objectKey {
		return "", errors.New("invalid avatar object key")
	}

	root, err := filepath.Abs(s.root)
	if err != nil {
		return "", fmt.Errorf("resolve avatar storage root: %w", err)
	}
	objectPath, err := filepath.Abs(filepath.Join(root, filepath.FromSlash(cleanKey)))
	if err != nil {
		return "", fmt.Errorf("resolve avatar object path: %w", err)
	}
	relative, err := filepath.Rel(root, objectPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("invalid avatar object key")
	}
	return objectPath, nil
}
