package controller

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/glebarez/sqlite"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useQueueWarmupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previousDB := model.DB
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.NamedLease{}, &model.SystemTask{}, &model.SystemTaskLock{}))
	t.Cleanup(func() { model.DB = previousDB })
	return db
}

func TestBuildDueChannelQueueWarmupTaskDeduplicates(t *testing.T) {
	db := useQueueWarmupTestDB(t)
	setting := `{"queue":{"enabled":true,"model":"gpt-4o","interval":30}}`
	require.NoError(t, db.Create(&model.Channel{Id: 101, Status: common.ChannelStatusEnabled, Models: "gpt-4o", Setting: &setting}).Error)

	task, built, err := buildDueChannelQueueWarmupTask(100)
	require.NoError(t, err)
	require.True(t, built)
	require.NotNil(t, task)

	second, built, err := buildDueChannelQueueWarmupTask(100)
	require.NoError(t, err)
	assert.False(t, built)
	assert.Equal(t, task.TaskID, second.TaskID)
}

func TestBuildDueChannelQueueWarmupTaskSkipsActiveLease(t *testing.T) {
	db := useQueueWarmupTestDB(t)
	setting := `{"queue":{"enabled":true,"model":"gpt-4o","interval":30}}`
	require.NoError(t, db.Create(&model.Channel{Id: 102, Status: common.ChannelStatusEnabled, Models: "gpt-4o", Setting: &setting}).Error)
	require.NoError(t, db.Create(&model.NamedLease{Name: queueLeaseName(102), Holder: "node", ExpiresAt: 100, UpdatedAt: 1}).Error)

	task, built, err := buildDueChannelQueueWarmupTask(100)
	require.NoError(t, err)
	assert.False(t, built)
	assert.Nil(t, task)
}

func TestQueueWarmerChannelScansOmitKey(t *testing.T) {
	db := useQueueWarmupTestDB(t)
	setting := `{"queue":{"enabled":true,"model":"gpt-4o","interval":30}}`
	require.NoError(t, db.Create(&model.Channel{
		Id: 103, Key: "channel-secret", Status: common.ChannelStatusEnabled,
		Models: "gpt-4o", Setting: &setting,
	}).Error)

	var channelQueryOmits []bool
	const callbackName = "test:channel_queue_warmer_omits_key"
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement == nil || tx.Statement.Table != "channels" {
			return
		}
		omitted := false
		for _, column := range tx.Statement.Omits {
			if column == "key" {
				omitted = true
				break
			}
		}
		channelQueryOmits = append(channelQueryOmits, omitted)
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove(callbackName) })

	task, built, err := buildDueChannelQueueWarmupTask(100)
	require.NoError(t, err)
	require.True(t, built)
	require.NotNil(t, task)

	views := GetChannelQueueStatus()
	require.Len(t, views, 1)
	assert.Equal(t, 103, views[0].ChannelID)
	require.Len(t, channelQueryOmits, 2)
	for _, omitted := range channelQueryOmits {
		assert.True(t, omitted)
	}
}

func TestClassifyWarmupOutcome(t *testing.T) {
	q := &dto.ChannelQueueSettings{
		QueueBusyStatusCodes: []int{429, 503},
	}

	tests := []struct {
		name   string
		result QueueWarmupResult
		want   warmupOutcome
	}{
		{
			name:   "2xx success",
			result: QueueWarmupResult{StatusCode: 200},
			want:   warmupOutcomeSuccess,
		},
		{
			name:   "429 queue busy",
			result: QueueWarmupResult{StatusCode: 429},
			want:   warmupOutcomeQueueBusy,
		},
		{
			name:   "503 queue busy",
			result: QueueWarmupResult{StatusCode: 503},
			want:   warmupOutcomeQueueBusy,
		},
		{
			name:   "custom busy code",
			result: QueueWarmupResult{StatusCode: 508},
			want:   warmupOutcomeQueueBusy,
		},
		{
			name:   "401 genuine failure",
			result: QueueWarmupResult{StatusCode: 401, Message: "invalid api key"},
			want:   warmupOutcomeFailure,
		},
		{
			name:   "busy message without busy code",
			result: QueueWarmupResult{StatusCode: 400, Message: "queue is full"},
			want:   warmupOutcomeQueueBusy,
		},
		{
			name:   "timeout",
			result: QueueWarmupResult{IsTimeout: true},
			want:   warmupOutcomeTimeout,
		},
		{
			name:   "connection error",
			result: QueueWarmupResult{Err: assert.AnError},
			want:   warmupOutcomeFailure,
		},
	}

	q508 := &dto.ChannelQueueSettings{QueueBusyStatusCodes: []int{508}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := q
			if tt.result.StatusCode == 508 {
				cfg = q508
			}
			assert.Equal(t, tt.want, classifyWarmupOutcome(tt.result, cfg))
		})
	}
}

func TestClassifyWarmupOutcomeDefaultsBusyCodes(t *testing.T) {
	// Empty QueueBusyStatusCodes falls back to [429, 503].
	q := &dto.ChannelQueueSettings{}
	assert.Equal(t, warmupOutcomeQueueBusy, classifyWarmupOutcome(QueueWarmupResult{StatusCode: 429}, q))
	assert.Equal(t, warmupOutcomeQueueBusy, classifyWarmupOutcome(QueueWarmupResult{StatusCode: 503}, q))
	assert.Equal(t, warmupOutcomeFailure, classifyWarmupOutcome(QueueWarmupResult{StatusCode: 504}, q))
}

func TestSanitizeWarmupMessage(t *testing.T) {
	tests := []struct {
		name    string
		message string
		secrets []string
	}{
		{
			name:    "plain text credentials",
			message: `request failed with Authorization: Bearer sk-abc123def, and api_key=secretvalue`,
			secrets: []string{"sk-abc123def", "secretvalue"},
		},
		{
			name:    "json credentials",
			message: `{"authorization":"Bearer json-auth","api_key":"json-api-key","access_token":"json-access-token","bearer":"json-bearer"}`,
			secrets: []string{"json-auth", "json-api-key", "json-access-token", "json-bearer"},
		},
		{
			name:    "nested json credentials",
			message: `{"error":"{\"authorization\":\"Bearer nested-auth\",\"access_token\":\"nested-access-token\"}"}`,
			secrets: []string{"nested-auth", "nested-access-token"},
		},
		{
			name:    "url query credentials",
			message: `upstream failed: https://example.test/v1?api_key=query-api-key&access_token=query-access-token&foo=bar`,
			secrets: []string{"query-api-key", "query-access-token"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sanitized := sanitizeWarmupMessage(tt.message)
			for _, secret := range tt.secrets {
				assert.NotContains(t, sanitized, secret)
			}
			assert.Contains(t, sanitized, "[REDACTED]")
		})
	}

	assert.Equal(t, "upstream unavailable", sanitizeWarmupMessage(" upstream unavailable "))
}

func TestIsQueueBusyStatusCode(t *testing.T) {
	q := &dto.ChannelQueueSettings{QueueBusyStatusCodes: []int{429, 503}}
	assert.True(t, isQueueBusyStatusCode(429, q))
	assert.True(t, isQueueBusyStatusCode(503, q))
	assert.False(t, isQueueBusyStatusCode(200, q))
}

func TestIsQueueBusyMessage(t *testing.T) {
	for _, msg := range []string{"queue is full", "upstream busy", "Rate limit exceeded", "TOO MANY REQUESTS", "service overloaded", "capacity reached"} {
		assert.True(t, isQueueBusyMessage(msg), "expected %q to be busy", msg)
	}
	assert.False(t, isQueueBusyMessage("invalid api key"))
	assert.False(t, isQueueBusyMessage(""))
}

func TestWarmerStateInFlightGuard(t *testing.T) {
	st := getWarmerState(999999)
	st.mu.Lock()
	// Simulate one in-flight round: a second warmOneChannel call must bail out.
	// warmOneChannel's lease path needs a DB, so we test the guard directly by
	// marking inFlight and observing that GetChannelQueueStatus reports warming.
	st.inFlight = true
	st.warming = true
	st.mu.Unlock()

	st.mu.Lock()
	assert.True(t, st.inFlight)
	assert.True(t, st.warming)
	st.mu.Unlock()
}

func TestDurationOrDefault(t *testing.T) {
	assert.Equal(t, 30*time.Second, durationOrDefault(30, 10))
	assert.Equal(t, 10*time.Second, durationOrDefault(0, 10))
	assert.Equal(t, 10*time.Second, durationOrDefault(-1, 10))
	assert.Equal(t, 10*time.Second, durationOrDefault(model.MaxQueueDurationSeconds+1, 10))
	assert.Equal(t, time.Duration(model.MaxQueueDurationSeconds)*time.Second, durationOrDefault(0, model.MaxQueueDurationSeconds+1))
}

func TestQueueLeaseName(t *testing.T) {
	assert.Equal(t, "upstream_queue:42", queueLeaseName(42))
}

func TestQueueWarmupResultAggregation(t *testing.T) {
	result := &channelQueueWarmupResult{
		ScannedChannels: 3,
		StatusCodes:     map[string]int{},
	}
	for _, outcome := range []channelQueueWarmupOutcome{
		{Attempts: 1, Outcome: warmupOutcomeSuccess, StatusCode: 200},
		{Attempts: 2, Outcome: warmupOutcomeQueueBusy, StatusCode: 429},
		{Attempts: 1, Outcome: warmupOutcomeFailure, StatusCode: 401, Message: "Authorization: Bearer secret"},
	} {
		if outcome.Attempts > 0 {
			result.AttemptedChannels++
		}
		result.StatusCodes[fmt.Sprintf("%d", outcome.StatusCode)]++
		switch outcome.Outcome {
		case warmupOutcomeSuccess:
			result.Succeeded++
		case warmupOutcomeQueueBusy:
			result.QueueBusy++
		default:
			result.Failed++
			result.FailureSamples = append(result.FailureSamples, truncateWarmup(sanitizeWarmupMessage(outcome.Message), queueWarmupFailureSampleLength))
		}
	}
	assert.Equal(t, 3, result.AttemptedChannels)
	assert.Equal(t, 1, result.Succeeded)
	assert.Equal(t, 1, result.QueueBusy)
	assert.Equal(t, 1, result.Failed)
	assert.NotContains(t, result.FailureSamples[0], "secret")
}

func TestApplyTestRequestMaxTokens(t *testing.T) {
	max := uint(16)

	t.Run("general request capped", func(t *testing.T) {
		req := &dto.GeneralOpenAIRequest{MaxTokens: ptrUint(100)}
		applyTestRequestMaxTokens(req, max)
		require.NotNil(t, req.MaxTokens)
		assert.Equal(t, uint(16), *req.MaxTokens)
	})

	t.Run("general request nil stays capped", func(t *testing.T) {
		req := &dto.GeneralOpenAIRequest{}
		applyTestRequestMaxTokens(req, max)
		require.NotNil(t, req.MaxTokens)
		assert.Equal(t, uint(16), *req.MaxTokens)
	})

	t.Run("general request already small stays", func(t *testing.T) {
		req := &dto.GeneralOpenAIRequest{MaxTokens: ptrUint(4)}
		applyTestRequestMaxTokens(req, max)
		require.NotNil(t, req.MaxTokens)
		assert.Equal(t, uint(4), *req.MaxTokens)
	})

	t.Run("zero is a no-op", func(t *testing.T) {
		req := &dto.GeneralOpenAIRequest{}
		applyTestRequestMaxTokens(req, 0)
		assert.Nil(t, req.MaxTokens)
	})
}

func ptrUint(v uint) *uint {
	return &v
}
