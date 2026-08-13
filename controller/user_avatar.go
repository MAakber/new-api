package controller

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	_ "golang.org/x/image/webp"
)

const (
	maxAvatarBytes        = 5 << 20
	maxAvatarRequestBytes = maxAvatarBytes + 64<<10
	maxAvatarEdge         = 4096
	maxAvatarPixels       = int64(16 << 20)
	avatarLockShardCount  = 257
)

var avatarMutationLocks [avatarLockShardCount]sync.Mutex

func GetSelfAvatar(c *gin.Context) {
	setAvatarResponseHeaders(c)
	avatar, err := model.GetUserAvatar(c.GetInt("id"))
	if err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to load avatar")
		return
	}
	if avatar == nil {
		c.Status(http.StatusNotFound)
		return
	}
	if avatar.MimeType != service.AvatarContentType || avatar.Size <= 0 || avatar.Size > service.AvatarMaxBytes {
		writeAvatarError(c, http.StatusInternalServerError, "avatar metadata is invalid")
		return
	}

	file, err := service.NewAvatarStorage().Open(avatar.ObjectKey)
	if err != nil {
		if os.IsNotExist(err) {
			c.Status(http.StatusNotFound)
			return
		}
		writeAvatarError(c, http.StatusInternalServerError, "failed to open avatar")
		return
	}
	defer file.Close()
	c.DataFromReader(http.StatusOK, avatar.Size, avatar.MimeType, file, nil)
}

func PutSelfAvatar(c *gin.Context) {
	setAvatarResponseHeaders(c)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarRequestBytes)
	data, err := readAvatarPart(c)
	if err != nil {
		status := http.StatusBadRequest
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			status = http.StatusRequestEntityTooLarge
		}
		writeAvatarError(c, status, err.Error())
		return
	}

	decoded, width, height, err := decodeAvatar(data)
	if err != nil {
		writeAvatarError(c, http.StatusBadRequest, err.Error())
		return
	}
	encoded, width, height, err := service.NormalizeAvatarImage(decoded)
	if err != nil {
		writeAvatarError(c, http.StatusBadRequest, err.Error())
		return
	}

	userID := c.GetInt("id")
	release := lockAvatarMutation(userID)
	defer release()
	oldAvatar, err := model.GetUserAvatar(userID)
	if err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to load current avatar")
		return
	}
	version := int64(1)
	if oldAvatar != nil {
		version = oldAvatar.Version + 1
		if version <= 0 {
			version = 1
		}
	}

	storage := service.NewAvatarStorage()
	objectKey, err := storage.Put(userID, bytes.NewReader(encoded))
	if err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to store avatar")
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
		Version:   version,
	}
	if oldAvatar != nil {
		avatar.ID = oldAvatar.ID
	}
	if err := model.SaveUserAvatar(avatar); err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to save avatar metadata")
		return
	}
	cleanupObject = false

	if oldAvatar != nil && oldAvatar.ObjectKey != objectKey {
		if err := storage.Delete(oldAvatar.ObjectKey); err != nil {
			common.SysLog(fmt.Sprintf("failed to delete old avatar object for user %d: %v", userID, err))
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"avatar_url": userAvatarURL(avatar.Version),
		},
	})
}

func DeleteSelfAvatar(c *gin.Context) {
	setAvatarResponseHeaders(c)
	userID := c.GetInt("id")
	release := lockAvatarMutation(userID)
	defer release()
	avatar, err := model.GetUserAvatar(userID)
	if err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to load avatar")
		return
	}
	if avatar == nil {
		c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
		return
	}
	if err := model.DeleteUserAvatar(userID); err != nil {
		writeAvatarError(c, http.StatusInternalServerError, "failed to delete avatar metadata")
		return
	}
	if err := service.NewAvatarStorage().Delete(avatar.ObjectKey); err != nil {
		common.SysLog(fmt.Sprintf("failed to delete avatar object for user %d: %v", userID, err))
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": ""})
}

func readAvatarPart(c *gin.Context) ([]byte, error) {
	if !strings.HasPrefix(strings.ToLower(c.GetHeader("Content-Type")), "multipart/form-data") {
		return nil, errors.New("avatar must be uploaded as multipart form data")
	}
	reader, err := c.Request.MultipartReader()
	if err != nil {
		return nil, fmt.Errorf("invalid multipart form data: %w", err)
	}
	var avatarData []byte
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("invalid multipart form data: %w", err)
		}
		if part.FormName() != "avatar" {
			_, readErr := io.Copy(io.Discard, part)
			_ = part.Close()
			if readErr != nil {
				return nil, readErr
			}
			continue
		}
		if avatarData != nil {
			_ = part.Close()
			return nil, errors.New("avatar field must be provided only once")
		}
		data, readErr := io.ReadAll(io.LimitReader(part, maxAvatarBytes+1))
		_ = part.Close()
		if readErr != nil {
			return nil, fmt.Errorf("failed to read avatar: %w", readErr)
		}
		if len(data) > maxAvatarBytes {
			return nil, errors.New("avatar must be at most 5 MiB")
		}
		avatarData = data
	}
	if avatarData == nil {
		return nil, errors.New("avatar field is required")
	}
	return avatarData, nil
}

func lockAvatarMutation(userID int) func() {
	if userID < 0 {
		userID = -userID
	}
	mutex := &avatarMutationLocks[userID%avatarLockShardCount]
	mutex.Lock()
	return mutex.Unlock
}

func decodeAvatar(data []byte) (image.Image, int, int, error) {
	if len(data) == 0 {
		return nil, 0, 0, errors.New("avatar is empty")
	}
	sniffed := http.DetectContentType(data)
	config, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return nil, 0, 0, errors.New("avatar is not a valid image")
	}
	format = strings.ToLower(format)
	var expectedMime string
	switch format {
	case "jpeg", "jpg":
		expectedMime = "image/jpeg"
	case "png":
		expectedMime = "image/png"
	case "webp":
		expectedMime = "image/webp"
	default:
		return nil, 0, 0, errors.New("avatar must be JPEG, PNG, or WebP")
	}
	if format != "webp" && sniffed != expectedMime {
		return nil, 0, 0, errors.New("avatar content type does not match its image format")
	}
	if config.Width <= 0 || config.Height <= 0 || config.Width > maxAvatarEdge || config.Height > maxAvatarEdge {
		return nil, 0, 0, errors.New("avatar edge must be at most 4096 pixels")
	}
	if int64(config.Width)*int64(config.Height) > maxAvatarPixels {
		return nil, 0, 0, errors.New("avatar must be at most 16 megapixels")
	}

	decoded, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || strings.ToLower(decodedFormat) != format {
		return nil, 0, 0, errors.New("avatar is not a valid image")
	}
	return decoded, config.Width, config.Height, nil
}

func setAvatarResponseHeaders(c *gin.Context) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
}

func writeAvatarError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message})
}

func userAvatarURL(version int64) string {
	return fmt.Sprintf("/api/user/self/avatar?v=%d", version)
}
