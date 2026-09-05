package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
)

const (
	maxOAuthAvatarURLLength = 2048
	oauthAvatarFetchTimeout = 10 * time.Second
)

var oauthAvatarHTTPClientFactory = func() *http.Client {
	return service.GetSSRFProtectedHTTPClient()
}

func validateOAuthAvatarURL(rawURL string) (string, error) {
	avatarURL := strings.TrimSpace(rawURL)
	if avatarURL == "" {
		return "", nil
	}
	if len(avatarURL) > maxOAuthAvatarURLLength {
		return "", errors.New("avatar URL is too long")
	}

	parsedURL, err := url.Parse(avatarURL)
	if err != nil {
		return "", fmt.Errorf("invalid avatar URL: %w", err)
	}
	scheme := strings.ToLower(parsedURL.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", errors.New("avatar URL must use http or https")
	}
	if parsedURL.Host == "" || parsedURL.Hostname() == "" {
		return "", errors.New("avatar URL host is required")
	}
	if parsedURL.User != nil {
		return "", errors.New("avatar URL user info is not allowed")
	}
	if parsedURL.Port() != "" {
		port, err := strconv.Atoi(parsedURL.Port())
		if err != nil || port < 1 || port > 65535 {
			return "", errors.New("avatar URL port is invalid")
		}
	} else if strings.HasSuffix(parsedURL.Host, ":") ||
		(!strings.HasPrefix(parsedURL.Host, "[") && strings.Count(parsedURL.Host, ":") == 1) {
		return "", errors.New("avatar URL port is invalid")
	}

	parsedURL.Scheme = scheme
	return parsedURL.String(), nil
}

func importOAuthAvatar(ctx context.Context, userID int, rawURL string) {
	avatarURL, err := validateOAuthAvatarURL(rawURL)
	if err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}
	if avatarURL == "" {
		return
	}

	// Avoid fetching an avatar when a user already has one. The second check
	// below closes the race between this check and the network request.
	release := lockAvatarMutation(userID)
	currentAvatar, err := model.GetUserAvatar(userID)
	release()
	if err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}
	if currentAvatar != nil {
		return
	}

	encoded, width, height, err := downloadOAuthAvatar(ctx, avatarURL)
	if err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}

	release = lockAvatarMutation(userID)
	defer release()
	currentAvatar, err = model.GetUserAvatar(userID)
	if err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}
	if currentAvatar != nil {
		return
	}

	storage := service.NewAvatarStorage()
	objectKey, err := storage.Put(userID, bytes.NewReader(encoded))
	if err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}
	cleanupObject := true
	defer func() {
		if cleanupObject {
			_ = storage.Delete(objectKey)
		}
	}()

	digest := sha256.Sum256(encoded)
	avatar := &model.UserAvatar{
		UserID:    userID,
		ObjectKey: objectKey,
		MimeType:  service.AvatarContentType,
		Size:      int64(len(encoded)),
		Width:     width,
		Height:    height,
		SHA256:    hex.EncodeToString(digest[:]),
		Version:   1,
	}
	if err := model.SaveUserAvatar(avatar); err != nil {
		logOAuthAvatarImportWarning(ctx, userID, err)
		return
	}
	cleanupObject = false
}

func downloadOAuthAvatar(ctx context.Context, avatarURL string) ([]byte, int, int, error) {
	validatedURL, err := validateOAuthAvatarURL(avatarURL)
	if err != nil {
		return nil, 0, 0, err
	}
	if validatedURL == "" {
		return nil, 0, 0, errors.New("avatar URL is empty")
	}
	if err := service.ValidateSSRFProtectedFetchURL(validatedURL); err != nil {
		return nil, 0, 0, err
	}

	client := oauthAvatarHTTPClientFactory()
	if client == nil {
		return nil, 0, 0, errors.New("SSRF-protected avatar HTTP client is unavailable")
	}

	if ctx == nil {
		ctx = context.Background()
	}
	requestContext, cancel := context.WithTimeout(ctx, oauthAvatarFetchTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, validatedURL, nil)
	if err != nil {
		return nil, 0, 0, err
	}
	request.Header.Set("Accept", "image/jpeg, image/png, image/webp")

	clientCopy := *client
	clientCopy.CheckRedirect = func(request *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return errors.New("stopped after 10 redirects")
		}
		redirectURL, err := validateOAuthAvatarURL(request.URL.String())
		if err != nil {
			return fmt.Errorf("redirect avatar URL rejected: %w", err)
		}
		if err := service.ValidateSSRFProtectedFetchURL(redirectURL); err != nil {
			return fmt.Errorf("redirect avatar URL rejected: %w", err)
		}
		return nil
	}

	response, err := clientCopy.Do(request)
	if err != nil {
		return nil, 0, 0, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, 0, 0, fmt.Errorf("avatar endpoint returned status %d", response.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(response.Body, maxAvatarBytes+1))
	if err != nil {
		return nil, 0, 0, err
	}
	if len(data) > maxAvatarBytes {
		return nil, 0, 0, errors.New("avatar must be at most 5 MiB")
	}
	decoded, _, _, err := decodeAvatar(data)
	if err != nil {
		return nil, 0, 0, err
	}
	return service.NormalizeAvatarImage(decoded)
}

func logOAuthAvatarImportWarning(ctx context.Context, userID int, err error) {
	if ctx == nil {
		ctx = context.Background()
	}
	logger.LogWarn(ctx, fmt.Sprintf("[OAuth] failed to import avatar for user %d: %v", userID, err))
}
