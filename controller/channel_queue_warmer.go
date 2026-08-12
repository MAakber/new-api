package controller

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
)

// Channel queue warmer defaults. They apply when a channel's Queue config
// leaves a tunable at zero/empty.
const (
	queueDefaultInterval    = 30 // seconds between warm-up calls
	queueDefaultTimeout     = 25 // seconds per squeeze round
	queueDefaultBackoff     = 30 // seconds between squeeze attempts
	queueDefaultMaxFailures = 10 // consecutive genuine failures before breaker
	queueDefaultCooldown    = 300
	// queueLeaseMargin extends the per-channel lease beyond the warm-up interval
	// so the lease itself enforces the cadence across nodes: a node that holds
	// the lease blocks every other node from warming until it naturally expires.
	queueLeaseMargin = 5 // seconds
)

// channelWarmerState is the in-process, per-channel warmer runtime state. It is
// guarded by channelWarmerStatesMu. The breaker only pauses warming for this
// channel — it never disables the channel or affects real requests.
type channelWarmerState struct {
	mu              sync.Mutex
	inFlight        bool
	consecutiveFail int
	breakerUntil    time.Time
	lastWarmAt      time.Time
	lastResult      string
	lastStatusCode  int
	warming         bool
}

// ChannelQueueStatusView is the public projection of one channel's warmer
// state. Returned by GetChannelQueueStatus for the admin API.
type ChannelQueueStatusView struct {
	ChannelID       int    `json:"channel_id"`
	ChannelName     string `json:"channel_name"`
	Enabled         bool   `json:"enabled"`
	Model           string `json:"model"`
	Warming         bool   `json:"warming"`
	BreakerActive   bool   `json:"breaker_active"`
	BreakerUntil    int64  `json:"breaker_until,omitempty"`
	ConsecutiveFail int    `json:"consecutive_failures"`
	LastWarmAt      int64  `json:"last_warm_at,omitempty"`
	LastStatusCode  int    `json:"last_status_code,omitempty"`
	LastResult      string `json:"last_result,omitempty"`
}

var channelWarmerStates sync.Map // channelID int -> *channelWarmerState

const (
	queueWarmupFailureSampleLimit  = 10
	queueWarmupFailureSampleLength = 256
)

type channelQueueWarmupTaskPayload struct {
	ChannelIDs []int  `json:"channel_ids,omitempty"`
	Trigger    string `json:"trigger,omitempty"`
}

type channelQueueWarmupResult struct {
	ScannedChannels   int            `json:"scanned_channels"`
	AttemptedChannels int            `json:"attempted_channels"`
	Succeeded         int            `json:"succeeded"`
	QueueBusy         int            `json:"queue_busy"`
	Timeout           int            `json:"timeout"`
	Failed            int            `json:"failed"`
	Skipped           int            `json:"skipped"`
	StatusCodes       map[string]int `json:"status_codes,omitempty"`
	FailureSamples    []string       `json:"failure_samples,omitempty"`
}

type channelQueueWarmupOutcome struct {
	ChannelID  int
	Outcome    warmupOutcome
	StatusCode int
	Attempts   int
	Message    string
	Skipped    bool
}

func buildDueChannelQueueWarmupTask(now int64) (*model.SystemTask, bool, error) {
	channels, err := model.GetAllChannels(0, -1, false, false)
	if err != nil {
		return nil, false, err
	}
	channelIDs := make([]int, 0)
	for _, channel := range channels {
		if channel.Status != common.ChannelStatusEnabled {
			continue
		}
		q := readQueueSetting(channel)
		if q == nil || !q.Enabled {
			continue
		}
		lease, err := model.GetNamedLease(queueLeaseName(channel.Id))
		if err != nil {
			return nil, false, err
		}
		if lease == nil || lease.ExpiresAt < now {
			channelIDs = append(channelIDs, channel.Id)
		}
	}
	if len(channelIDs) == 0 {
		return nil, false, nil
	}
	if active, err := model.GetActiveSystemTask(model.SystemTaskTypeChannelQueueWarmup); err != nil {
		return nil, false, err
	} else if active != nil {
		return active, false, nil
	}
	task, err := model.CreateSystemTask(model.SystemTaskTypeChannelQueueWarmup, channelQueueWarmupTaskPayload{
		ChannelIDs: channelIDs,
		Trigger:    "due",
	}, nil)
	if err != nil {
		active, activeErr := model.GetActiveSystemTask(model.SystemTaskTypeChannelQueueWarmup)
		if activeErr == nil && active != nil {
			return active, false, nil
		}
		return nil, false, err
	}
	return task, true, nil
}

func runChannelQueueWarmupRound(ctx context.Context, channelIDs []int, reportProgress func(processed, total int)) (*channelQueueWarmupResult, error) {
	result := &channelQueueWarmupResult{
		ScannedChannels: len(channelIDs),
		StatusCodes:     make(map[string]int),
	}
	if len(channelIDs) == 0 {
		if reportProgress != nil {
			reportProgress(0, 0)
		}
		return result, nil
	}

	outcomes := make(chan channelQueueWarmupOutcome, len(channelIDs))
	var wg sync.WaitGroup
	for _, channelID := range channelIDs {
		if ctx.Err() != nil {
			break
		}
		channelID := channelID
		wg.Add(1)
		go func() {
			defer wg.Done()
			channel, err := model.GetChannelById(channelID, true)
			if err != nil {
				outcomes <- channelQueueWarmupOutcome{ChannelID: channelID, Outcome: warmupOutcomeFailure, Message: sanitizeWarmupMessage(err.Error())}
				return
			}
			if channel.Status != common.ChannelStatusEnabled {
				outcomes <- channelQueueWarmupOutcome{ChannelID: channelID, Skipped: true}
				return
			}
			q := readQueueSetting(channel)
			if q == nil || !q.Enabled {
				outcomes <- channelQueueWarmupOutcome{ChannelID: channelID, Skipped: true}
				return
			}
			outcomes <- warmOneChannel(ctx, channel, q)
		}()
	}
	wg.Wait()
	close(outcomes)
	processed := 0
	for outcome := range outcomes {
		processed++
		if reportProgress != nil {
			reportProgress(processed, len(channelIDs))
		}
		if outcome.Skipped {
			result.Skipped++
			continue
		}
		if outcome.Attempts > 0 {
			result.AttemptedChannels++
		}
		if outcome.StatusCode != 0 {
			result.StatusCodes[fmt.Sprintf("%d", outcome.StatusCode)]++
		}
		switch outcome.Outcome {
		case warmupOutcomeSuccess:
			result.Succeeded++
		case warmupOutcomeQueueBusy:
			result.QueueBusy++
		case warmupOutcomeTimeout:
			result.Timeout++
		default:
			result.Failed++
			if outcome.Message != "" && len(result.FailureSamples) < queueWarmupFailureSampleLimit {
				result.FailureSamples = append(result.FailureSamples, truncateWarmup(outcome.Message, queueWarmupFailureSampleLength))
			}
		}
	}
	if ctx.Err() != nil {
		return result, ctx.Err()
	}
	return result, nil
}

// warmOneChannel performs one squeeze round for a channel. Each round acquires
// a database-backed named lease scoped to the channel; only the lease holder
// warms, so multiple master-capable nodes never warm the same channel
// concurrently, and the lease TTL (interval + margin) enforces the cadence
// across nodes. Inside a round, queue-busy results are retried with a backoff
// up to MaxQueueAttempts (0 = unlimited) or until the round timeout elapses.
// The circuit breaker and in-flight guard are process-local and only pause
// this node's warming — real requests are never affected.
func warmOneChannel(parentCtx context.Context, channel *model.Channel, q *dto.ChannelQueueSettings) channelQueueWarmupOutcome {
	if parentCtx == nil {
		parentCtx = context.Background()
	}
	if channel == nil || q == nil {
		return channelQueueWarmupOutcome{Skipped: true}
	}
	state := getWarmerState(channel.Id)
	state.mu.Lock()
	if state.inFlight {
		state.mu.Unlock()
		return channelQueueWarmupOutcome{ChannelID: channel.Id, Skipped: true}
	}
	// Circuit breaker: pause warming until the cooldown elapses.
	if q.CircuitBreakerEnabled && !state.breakerUntil.IsZero() && time.Now().Before(state.breakerUntil) {
		state.mu.Unlock()
		return channelQueueWarmupOutcome{ChannelID: channel.Id, Skipped: true}
	}
	state.inFlight = true
	state.warming = true
	state.mu.Unlock()

	defer func() {
		state.mu.Lock()
		state.inFlight = false
		state.warming = false
		state.mu.Unlock()
	}()
	result := channelQueueWarmupOutcome{ChannelID: channel.Id}

	// Cross-node mutual exclusion + cadence. The lease is deliberately NOT
	// released after a successful round: its TTL (interval + margin) acts as the
	// minimum gap between warm-ups, and whoever acquires it next (this node or
	// another) runs the following round.
	interval := durationOrDefault(q.Interval, queueDefaultInterval)
	leaseTTL := int64(interval.Seconds()) + queueLeaseMargin
	now := time.Now().Unix()
	holder := fmt.Sprintf("%s-%s", common.NodeName, common.GetRandomString(8))
	acquired, err := model.AcquireNamedLease(queueLeaseName(channel.Id), holder, now, now+leaseTTL)
	if err != nil {
		logger.LogWarn(parentCtx, fmt.Sprintf("queue warmer: lease acquire failed channel=%d: %v", channel.Id, err))
		result.Outcome = warmupOutcomeFailure
		result.Message = sanitizeWarmupMessage(err.Error())
		return result
	}
	if !acquired {
		// Another node is warming this channel or the cadence window is open.
		result.Skipped = true
		return result
	}

	timeout := durationOrDefault(q.Timeout, queueDefaultTimeout)
	if timeout >= interval {
		timeout = interval - 1
		if timeout < 1 {
			timeout = 1
		}
	}
	ctx, cancel := context.WithTimeout(parentCtx, timeout)
	defer cancel()

	backoff := durationOrDefault(q.BackoffSeconds, queueDefaultBackoff)
	maxAttempts := q.MaxQueueAttempts

	var lastResult QueueWarmupResult
	for attempt := 1; ; attempt++ {
		if ctx.Err() != nil {
			break
		}
		result.Attempts = attempt
		lastResult = PerformChannelQueueWarmup(
			ctx,
			channel,
			strings.TrimSpace(q.Model),
			q.EndpointType,
			q.WarmupMessage,
			q.MaxTokens,
			shouldUseStreamForQueueWarmup(channel),
		)
		outcome := classifyWarmupOutcome(lastResult, q)
		if outcome != warmupOutcomeQueueBusy {
			break
		}
		if maxAttempts > 0 && attempt >= maxAttempts {
			break
		}
		select {
		case <-ctx.Done():
		case <-time.After(backoff):
		}
	}
	if result.Attempts == 0 {
		result.Skipped = true
		return result
	}

	outcome := classifyWarmupOutcome(lastResult, q)
	result.Outcome = outcome
	result.StatusCode = lastResult.StatusCode
	result.Message = sanitizeWarmupMessage(lastResult.Message)
	state.mu.Lock()
	state.lastWarmAt = time.Now()
	state.lastStatusCode = lastResult.StatusCode
	state.lastResult = classifyWarmupResult(outcome, lastResult)
	switch outcome {
	case warmupOutcomeQueueBusy:
		// Expected while squeezing in: do not count as failure.
	case warmupOutcomeSuccess:
		state.consecutiveFail = 0
		state.breakerUntil = time.Time{}
	case warmupOutcomeTimeout:
		// Timeouts do not trip the breaker; recorded for observability only.
	case warmupOutcomeFailure:
		state.consecutiveFail++
		maxFail := q.MaxConsecutiveFailures
		if maxFail <= 0 {
			maxFail = queueDefaultMaxFailures
		}
		if q.CircuitBreakerEnabled && state.consecutiveFail >= maxFail {
			cooldown := durationOrDefault(q.CooldownSeconds, queueDefaultCooldown)
			state.breakerUntil = time.Now().Add(cooldown)
			logger.LogWarn(ctx, fmt.Sprintf("queue warmer: channel %d breaker tripped for %ds (consecutive failures=%d)", channel.Id, int64(cooldown/time.Second), state.consecutiveFail))
		}
	}
	state.mu.Unlock()
	return result
}

// queueLeaseName returns the DB lease name used to serialize warm-ups for a
// channel across nodes.
func queueLeaseName(channelID int) string {
	return fmt.Sprintf("upstream_queue:%d", channelID)
}

// warmupOutcome classifies a warm-up result into one of four buckets that drive
// the breaker state machine.
type warmupOutcome int

const (
	warmupOutcomeSuccess warmupOutcome = iota
	warmupOutcomeQueueBusy
	warmupOutcomeTimeout
	warmupOutcomeFailure
)

func classifyWarmupOutcome(r QueueWarmupResult, q *dto.ChannelQueueSettings) warmupOutcome {
	if r.IsTimeout {
		return warmupOutcomeTimeout
	}
	if r.Err == nil && r.StatusCode >= 200 && r.StatusCode < 300 {
		return warmupOutcomeSuccess
	}
	if isQueueBusyStatusCode(r.StatusCode, q) {
		return warmupOutcomeQueueBusy
	}
	if isQueueBusyMessage(r.Message) {
		return warmupOutcomeQueueBusy
	}
	return warmupOutcomeFailure
}

func classifyWarmupResult(outcome warmupOutcome, r QueueWarmupResult) string {
	switch outcome {
	case warmupOutcomeSuccess:
		return "ok"
	case warmupOutcomeQueueBusy:
		return "queue_busy"
	case warmupOutcomeTimeout:
		return "timeout"
	default:
		if r.Message != "" {
			return truncateWarmup(r.Message, 120)
		}
		return "error"
	}
}

func isQueueBusyStatusCode(statusCode int, q *dto.ChannelQueueSettings) bool {
	codes := q.QueueBusyStatusCodes
	if len(codes) == 0 {
		codes = []int{429, 503}
	}
	for _, c := range codes {
		if c == statusCode {
			return true
		}
	}
	return false
}

func isQueueBusyMessage(msg string) bool {
	if msg == "" {
		return false
	}
	lower := strings.ToLower(msg)
	for _, hint := range []string{"queue", "busy", "full", "rate limit", "rate_limit", "too many requests", "overloaded", "capacity"} {
		if strings.Contains(lower, hint) {
			return true
		}
	}
	return false
}

func shouldUseStreamForQueueWarmup(channel *model.Channel) bool {
	if channel == nil {
		return false
	}
	return channel.Type == constant.ChannelTypeCodex || channel.Type == constant.ChannelTypeCodexCompatibility
}

func durationOrDefault(value, def int) time.Duration {
	seconds := value
	if seconds <= 0 || seconds > model.MaxQueueDurationSeconds {
		seconds = def
	}
	if seconds <= 0 {
		return 0
	}
	if seconds > model.MaxQueueDurationSeconds {
		seconds = model.MaxQueueDurationSeconds
	}
	return time.Duration(seconds) * time.Second
}

func getWarmerState(channelID int) *channelWarmerState {
	if v, ok := channelWarmerStates.Load(channelID); ok {
		return v.(*channelWarmerState)
	}
	st := &channelWarmerState{}
	actual, _ := channelWarmerStates.LoadOrStore(channelID, st)
	return actual.(*channelWarmerState)
}

func readQueueSetting(channel *model.Channel) *dto.ChannelQueueSettings {
	if channel == nil || channel.Setting == nil || *channel.Setting == "" {
		return nil
	}
	s := channel.GetSetting()
	return s.Queue
}

func truncateWarmup(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// GetChannelQueueStatus returns the warmer status for all queue-enabled
// channels. Channels whose Queue setting is disabled are omitted.
func GetChannelQueueStatus() []ChannelQueueStatusView {
	channels, err := model.GetAllChannels(0, -1, false, false)
	if err != nil {
		return nil
	}
	views := make([]ChannelQueueStatusView, 0)
	for _, channel := range channels {
		q := readQueueSetting(channel)
		if q == nil || !q.Enabled {
			continue
		}
		state := getWarmerState(channel.Id)
		state.mu.Lock()
		view := ChannelQueueStatusView{
			ChannelID:       channel.Id,
			ChannelName:     channel.Name,
			Enabled:         q.Enabled,
			Model:           q.Model,
			Warming:         state.warming,
			BreakerActive:   !state.breakerUntil.IsZero() && time.Now().Before(state.breakerUntil),
			ConsecutiveFail: state.consecutiveFail,
			LastStatusCode:  state.lastStatusCode,
			LastResult:      state.lastResult,
		}
		if view.BreakerActive {
			view.BreakerUntil = state.breakerUntil.Unix()
		}
		if !state.lastWarmAt.IsZero() {
			view.LastWarmAt = state.lastWarmAt.Unix()
		}
		state.mu.Unlock()
		views = append(views, view)
	}
	return views
}

// GetChannelQueueStatusHandler is the gin handler for the admin status endpoint.
func GetChannelQueueStatusHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    GetChannelQueueStatus(),
	})
}
