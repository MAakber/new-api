package service

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"

	"github.com/gin-gonic/gin"
)

const autoBanMinimumEventRetentionSeconds = int64(30 * 24 * 60 * 60)

type AutoBanTrigger struct {
	RuleType string
	Subject  string
	Distinct bool
	Evidence map[string]interface{}
}

type AutoBanDecision struct {
	Evaluated        bool                  `json:"evaluated"`
	ThresholdReached bool                  `json:"threshold_reached"`
	Observed         bool                  `json:"observed"`
	Banned           bool                  `json:"banned"`
	Count            int                   `json:"count"`
	RecordId         int64                 `json:"record_id"`
	Response         model.AutoBanResponse `json:"response"`
}

type trackedSubject struct {
	lastSeen      int64
	lastPersisted int64
}

type subjectTrackerEntry struct {
	mu          sync.Mutex
	loadedSince int64
	lastAccess  int64
	subjects    map[string]trackedSubject
}

var autoBanSubjectTrackers sync.Map
var autoBanLastCleanup atomic.Int64

func truncateAutoBanValue(value string, maxLength int) string {
	value = strings.TrimSpace(value)
	runes := []rune(value)
	if len(runes) <= maxLength {
		return value
	}
	return string(runes[:maxLength])
}

func NormalizeAutoBanIP(rawIP string) (net.IP, string) {
	ip := net.ParseIP(strings.TrimSpace(rawIP))
	if ip == nil {
		return nil, strings.TrimSpace(rawIP)
	}
	if ipv4 := ip.To4(); ipv4 != nil {
		return ipv4, ipv4.String()
	}
	mask := net.CIDRMask(64, 128)
	networkIP := ip.Mask(mask)
	return ip, (&net.IPNet{IP: networkIP, Mask: mask}).String()
}

func autoBanEvidenceJSON(evidence map[string]interface{}) string {
	if evidence == nil {
		return "{}"
	}
	encoded, err := json.Marshal(evidence)
	if err != nil {
		return "{}"
	}
	return string(encoded)
}

func autoBanEventRetentionSeconds() int64 {
	config := setting.GetAutoBanConfig()
	retention := autoBanMinimumEventRetentionSeconds
	for _, rule := range []setting.AutoBanRuleConfig{
		config.SensitiveWords,
		config.UserAgent,
		config.ExcessiveIPs,
		config.ModelProbing,
	} {
		windowSeconds := int64(rule.WindowMinutes) * 60
		if windowSeconds > retention {
			retention = windowSeconds
		}
	}
	return retention
}

func maybeCleanupAutoBanEvents(now int64) {
	last := autoBanLastCleanup.Load()
	if now-last < 3600 || !autoBanLastCleanup.CompareAndSwap(last, now) {
		return
	}
	before := now - autoBanEventRetentionSeconds()
	go func() {
		if err := model.DeleteUserSecurityEventsBefore(before); err != nil {
			common.SysLog("failed to clean old user security events: " + err.Error())
		}
		staleBefore := now - 6*60*60
		autoBanSubjectTrackers.Range(func(key, value interface{}) bool {
			entry, ok := value.(*subjectTrackerEntry)
			if !ok {
				autoBanSubjectTrackers.Delete(key)
				return true
			}
			entry.mu.Lock()
			stale := entry.lastAccess < staleBefore
			entry.mu.Unlock()
			if stale {
				autoBanSubjectTrackers.Delete(key)
			}
			return true
		})
	}()
}

func persistAutoBanEvent(c *gin.Context, trigger AutoBanTrigger, subject string, now int64) error {
	return model.CreateUserSecurityEvent(&model.UserSecurityEvent{
		UserId:    c.GetInt("id"),
		RuleType:  trigger.RuleType,
		Subject:   truncateAutoBanValue(subject, 255),
		Evidence:  autoBanEvidenceJSON(trigger.Evidence),
		TokenId:   c.GetInt("token_id"),
		Ip:        truncateAutoBanValue(c.ClientIP(), 64),
		UserAgent: truncateAutoBanValue(c.Request.UserAgent(), 512),
		RequestId: truncateAutoBanValue(c.GetString(common.RequestIdKey), 64),
		CreatedAt: now,
	})
}

func getSubjectTracker(userId int, ruleType string) *subjectTrackerEntry {
	key := fmt.Sprintf("%d:%s", userId, ruleType)
	entry, _ := autoBanSubjectTrackers.LoadOrStore(key, &subjectTrackerEntry{subjects: make(map[string]trackedSubject)})
	return entry.(*subjectTrackerEntry)
}

func recordDistinctAutoBanSubject(c *gin.Context, trigger AutoBanTrigger, windowSeconds int64, now int64) (int, error) {
	userId := c.GetInt("id")
	cutoff := now - windowSeconds
	entry := getSubjectTracker(userId, trigger.RuleType)
	entry.mu.Lock()
	defer entry.mu.Unlock()
	entry.lastAccess = now

	if entry.loadedSince == 0 || cutoff < entry.loadedSince {
		rows, err := model.LoadUserSecuritySubjectLastSeenSince(userId, trigger.RuleType, cutoff)
		if err != nil {
			return 0, err
		}
		entry.subjects = make(map[string]trackedSubject, len(rows))
		for _, row := range rows {
			entry.subjects[row.Subject] = trackedSubject{lastSeen: row.LastSeen, lastPersisted: row.LastSeen}
		}
		entry.loadedSince = cutoff
	}
	for subject, tracked := range entry.subjects {
		if tracked.lastSeen < cutoff {
			delete(entry.subjects, subject)
		}
	}

	subject := truncateAutoBanValue(trigger.Subject, 255)
	tracked, exists := entry.subjects[subject]
	checkpointSeconds := windowSeconds / 2
	if checkpointSeconds < 60 {
		checkpointSeconds = 60
	}
	if checkpointSeconds > 3600 {
		checkpointSeconds = 3600
	}
	shouldPersist := !exists || now-tracked.lastPersisted >= checkpointSeconds
	if shouldPersist {
		if err := persistAutoBanEvent(c, trigger, subject, now); err != nil {
			return 0, err
		}
		tracked.lastPersisted = now
	}
	tracked.lastSeen = now
	entry.subjects[subject] = tracked

	if !exists {
		count, err := model.CountDistinctUserSecuritySubjectsSince(userId, trigger.RuleType, cutoff)
		if err != nil {
			return 0, err
		}
		return int(count), nil
	}
	return len(entry.subjects), nil
}

func recordRepeatedAutoBanEvent(c *gin.Context, trigger AutoBanTrigger, windowSeconds int64, now int64) (int, error) {
	if err := persistAutoBanEvent(c, trigger, trigger.Subject, now); err != nil {
		return 0, err
	}
	count, err := model.CountUserSecurityEventsSince(c.GetInt("id"), trigger.RuleType, now-windowSeconds)
	return int(count), err
}

func EvaluateAutoBanTrigger(c *gin.Context, trigger AutoBanTrigger) (*AutoBanDecision, error) {
	decision := &AutoBanDecision{}
	config := setting.GetAutoBanConfig()
	rule, exists := setting.GetAutoBanRule(trigger.RuleType)
	if !config.Enabled || !exists || !rule.Enabled {
		return decision, nil
	}
	userId := c.GetInt("id")
	if userId <= 0 {
		return decision, nil
	}
	user, err := model.GetUserCache(userId)
	if err != nil {
		return decision, err
	}
	ip, _ := NormalizeAutoBanIP(c.ClientIP())
	if setting.IsAutoBanExempt(userId, user.Role, user.Group, ip) {
		return decision, nil
	}
	decision.Evaluated = true
	now := time.Now().Unix()
	windowSeconds := int64(rule.WindowMinutes * 60)
	var count int
	if trigger.Distinct {
		count, err = recordDistinctAutoBanSubject(c, trigger, windowSeconds, now)
	} else {
		count, err = recordRepeatedAutoBanEvent(c, trigger, windowSeconds, now)
	}
	if err != nil {
		return decision, err
	}
	decision.Count = count
	maybeCleanupAutoBanEvents(now)
	if count < rule.Threshold {
		return decision, nil
	}
	decision.ThresholdReached = true
	recordEvidence := make(map[string]interface{}, len(trigger.Evidence)+3)
	for key, value := range trigger.Evidence {
		recordEvidence[key] = value
	}
	recordEvidence["subject"] = trigger.Subject
	recordEvidence["trigger_count"] = count
	recordEvidence["threshold"] = rule.Threshold
	input := model.AutoBanActionInput{
		UserId:             userId,
		RuleType:           trigger.RuleType,
		Mode:               rule.Mode,
		TriggerCount:       count,
		Threshold:          rule.Threshold,
		WindowMinutes:      rule.WindowMinutes,
		BanDurationMinutes: rule.BanDurationMinutes,
		ResponseStatus:     rule.ResponseStatus,
		ResponseCode:       rule.ResponseCode,
		ResponseMessage:    rule.ResponseMessage,
		Ip:                 truncateAutoBanValue(c.ClientIP(), 64),
		UserAgent:          truncateAutoBanValue(c.Request.UserAgent(), 512),
		Evidence:           autoBanEvidenceJSON(recordEvidence),
	}
	if rule.Mode == setting.AutoBanModeObserve {
		record, created, createErr := model.CreateObservedAutoBanRecord(input)
		if record != nil {
			decision.RecordId = record.Id
		}
		decision.Observed = created
		return decision, createErr
	}
	record, applied, applyErr := model.ApplyUserAutoBan(input)
	if record != nil {
		decision.RecordId = record.Id
		decision.Response = model.AutoBanResponse{
			Until:   record.ExpiresAt,
			Rule:    record.RuleType,
			Status:  record.ResponseStatus,
			Code:    record.ResponseCode,
			Message: record.ResponseMessage,
		}
	}
	decision.Banned = applied || (record != nil && record.Status == model.AutoBanRecordStatusActive && record.ExpiresAt > now)
	return decision, applyErr
}
