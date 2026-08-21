package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"gorm.io/gorm"
)

const (
	runtimeRoundRobinMaxAttempts  = 12
	runtimeRoundRobinRetryBackoff = 2 * time.Millisecond
	runtimeHeaderProfileScopeType = "channel_header_profile"
)

// runtimeProfileUnsafeHeaderNames lists headers that must never be sourced from
// a header profile. They are either hop-by-hop, transport controlled, or carry
// credentials/client provenance that the relay resolves on its own.
var runtimeProfileUnsafeHeaderNames = map[string]struct{}{
	"accept-encoding":     {},
	"authorization":       {},
	"connection":          {},
	"content-length":      {},
	"cookie":              {},
	"host":                {},
	"keep-alive":          {},
	"origin":              {},
	"proxy-authenticate":  {},
	"proxy-authorization": {},
	"proxy-connection":    {},
	"te":                  {},
	"trailer":             {},
	"transfer-encoding":   {},
	"upgrade":             {},
	"cf-connecting-ip":    {},
	"forwarded":           {},
	"x-api-key":           {},
	"x-forwarded-for":     {},
	"x-forwarded-host":    {},
	"x-forwarded-proto":   {},
	"x-goog-api-key":      {},
	"x-real-ip":           {},
}

// IsRuntimeProfileUnsafeHeader reports whether a header profile is allowed to
// set the given header name on an upstream request.
func IsRuntimeProfileUnsafeHeader(name string) bool {
	normalized := strings.ToLower(strings.TrimSpace(name))
	if strings.HasPrefix(normalized, "sec-fetch-") {
		return true
	}
	_, exists := runtimeProfileUnsafeHeaderNames[normalized]
	return exists
}

// ResolveChannelRuntimeHeaderProfileHeaders resolves the headers contributed by
// a channel's header profile strategy for the current request. Round robin mode
// advances a persisted cursor so the rotation survives process restarts and is
// consistent across instances.
func ResolveChannelRuntimeHeaderProfileHeaders(channelID int, strategy *dto.HeaderProfileStrategy) (map[string]string, string, error) {
	if strategy == nil || !strategy.Enabled {
		return nil, "", nil
	}

	requestIndex := 0
	if strategy.Mode == dto.HeaderProfileModeRoundRobin {
		selectedProfileIDs := normalizeRuntimeHeaderProfileIDs(strategy.SelectedProfileIDs)
		if len(selectedProfileIDs) > 1 {
			if channelID <= 0 {
				return nil, "", errors.New("请求头模板轮询需要有效渠道 ID")
			}
			scopeKey := fmt.Sprintf("channel:%d:%s", channelID, runtimeRoundRobinValuesFingerprint(selectedProfileIDs))
			selectedProfileID, err := nextRoundRobinRuntimeValue(
				runtimeHeaderProfileScopeType,
				scopeKey,
				selectedProfileIDs,
			)
			if err != nil {
				return nil, "", err
			}
			for index, profileID := range selectedProfileIDs {
				if profileID == selectedProfileID {
					requestIndex = index
					break
				}
			}
		}
	}

	headers, profileID, err := dto.ResolveHeaderProfileStrategyHeaders(strategy, requestIndex)
	if err != nil {
		return nil, "", err
	}
	// Drop headers the relay must own so a profile can never leak credentials
	// or break transport framing.
	for name := range headers {
		if IsRuntimeProfileUnsafeHeader(name) {
			delete(headers, name)
		}
	}
	return headers, profileID, nil
}

func normalizeRuntimeHeaderProfileIDs(profileIDs []string) []string {
	seen := map[string]struct{}{}
	result := make([]string, 0, len(profileIDs))
	for _, profileID := range profileIDs {
		trimmedID := strings.TrimSpace(profileID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}
		seen[trimmedID] = struct{}{}
		result = append(result, trimmedID)
	}
	return result
}

// runtimeRoundRobinValuesFingerprint keys the persisted cursor by the exact
// candidate set so editing the selection restarts rotation instead of
// reusing a stale index.
func runtimeRoundRobinValuesFingerprint(values []string) string {
	hash := sha256.New()
	for _, value := range values {
		hash.Write([]byte(strings.TrimSpace(value)))
		hash.Write([]byte{0})
	}
	sum := hash.Sum(nil)
	return hex.EncodeToString(sum[:16])
}

// nextRoundRobinRuntimeValue advances the persisted round robin cursor using an
// optimistic-locking update so concurrent requests across instances do not
// reuse the same slot.
func nextRoundRobinRuntimeValue(scopeType string, scopeKey string, values []string) (string, error) {
	if scopeType == "" || scopeKey == "" {
		return "", errors.New("轮询作用域不能为空")
	}
	if len(values) == 0 {
		return "", errors.New("轮询列表不能为空")
	}
	if model.DB == nil {
		return "", errors.New("数据库未初始化，无法执行请求头模板轮询")
	}

	now := common.GetTimestamp()
	for attempt := 0; attempt < runtimeRoundRobinMaxAttempts; attempt++ {
		state := model.RequestHeaderStrategyState{}
		err := model.DB.Where("scope_type = ? AND scope_key = ?", scopeType, scopeKey).First(&state).Error
		switch {
		case errors.Is(err, gorm.ErrRecordNotFound):
			state = model.RequestHeaderStrategyState{
				ScopeType:        scopeType,
				ScopeKey:         scopeKey,
				RoundRobinCursor: 1,
				Version:          1,
				UpdatedAt:        now,
			}
			if err := model.DB.Create(&state).Error; err != nil {
				if isRuntimeDuplicateConstraintError(err) {
					sleepRuntimeRoundRobinRetry(attempt)
					continue
				}
				return "", err
			}
			return values[0], nil
		case err != nil:
			return "", err
		default:
			index := int(state.RoundRobinCursor % int64(len(values)))
			result := model.DB.Model(&model.RequestHeaderStrategyState{}).
				Where("scope_type = ? AND scope_key = ? AND version = ?", scopeType, scopeKey, state.Version).
				Updates(map[string]any{
					"round_robin_cursor": state.RoundRobinCursor + 1,
					"version":            state.Version + 1,
					"updated_at":         now,
				})
			if result.Error != nil {
				return "", result.Error
			}
			if result.RowsAffected == 1 {
				return values[index], nil
			}
			sleepRuntimeRoundRobinRetry(attempt)
		}
	}

	return "", errors.New("轮询状态更新失败")
}

func sleepRuntimeRoundRobinRetry(attempt int) {
	time.Sleep(time.Duration(attempt+1) * runtimeRoundRobinRetryBackoff)
}

func isRuntimeDuplicateConstraintError(err error) bool {
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}

	lower := strings.ToLower(err.Error())
	return strings.Contains(lower, "duplicate") || strings.Contains(lower, "unique")
}
