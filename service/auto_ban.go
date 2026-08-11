package service

import (
	"net"
	"strings"
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
	Evaluated         bool                  `json:"evaluated"`
	ThresholdReached  bool                  `json:"threshold_reached"`
	Observed          bool                  `json:"observed"`
	Banned            bool                  `json:"banned"`
	Count             int                   `json:"count"`
	RecordId          int64                 `json:"record_id"`
	ViolationResponse model.AutoBanResponse `json:"violation_response"`
	Response          model.AutoBanResponse `json:"response"`
}

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
	encoded, err := common.Marshal(evidence)
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
	db := model.DB
	go func() {
		if err := model.DeleteUserSecurityEventsBeforeWithDB(db, before); err != nil {
			common.SysLog("failed to clean old user security events: " + err.Error())
		}
	}()
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
	input := model.UserAutoBanTriggerInput{
		Action: model.AutoBanActionInput{
			UserId:             userId,
			RuleType:           trigger.RuleType,
			Mode:               rule.Mode,
			TriggerCount:       0,
			Threshold:          rule.Threshold,
			WindowMinutes:      rule.WindowMinutes,
			BanDurationMinutes: rule.BanDurationMinutes,
			ResponseStatus:     rule.ResponseStatus,
			ResponseCode:       rule.ResponseCode,
			ResponseMessage:    rule.ResponseMessage,
			Ip:                 truncateAutoBanValue(c.ClientIP(), 64),
			UserAgent:          truncateAutoBanValue(c.Request.UserAgent(), 512),
			Evidence:           autoBanEvidenceJSON(trigger.Evidence),
		},
		Subject:   truncateAutoBanValue(trigger.Subject, 255),
		Distinct:  trigger.Distinct,
		Enforce:   rule.Mode == setting.AutoBanModeEnforce,
		TokenId:   c.GetInt("token_id"),
		RequestId: truncateAutoBanValue(c.GetString(common.RequestIdKey), 64),
	}
	result, evaluateErr := model.EvaluateUserAutoBanTrigger(input)
	if result == nil || !result.Committed {
		return decision, evaluateErr
	}
	decision.Count = result.Count
	decision.ThresholdReached = result.ThresholdReached
	decision.Observed = result.Observed
	maybeCleanupAutoBanEvents(time.Now().Unix())
	if trigger.RuleType == setting.AutoBanRuleSensitiveWords {
		violationResponse := config.SensitiveWordViolationResponse
		decision.ViolationResponse = model.AutoBanResponse{
			Rule:    trigger.RuleType,
			Status:  violationResponse.Status,
			Code:    violationResponse.Code,
			Message: setting.FormatSensitiveWordViolationMessage(violationResponse.Message, result.Count, rule.Threshold),
		}
	}
	if result.Record != nil {
		banUntil := result.Record.ExpiresAt
		if banUntil == 0 && result.Record.Status == model.AutoBanRecordStatusActive {
			banUntil = -1
		}
		decision.RecordId = result.Record.Id
		decision.Response = model.AutoBanResponse{
			Until:   banUntil,
			Rule:    result.Record.RuleType,
			Status:  result.Record.ResponseStatus,
			Code:    result.Record.ResponseCode,
			Message: result.Record.ResponseMessage,
		}
	}
	now := time.Now().Unix()
	decision.Banned = result.Applied || (result.Record != nil && result.Record.Status == model.AutoBanRecordStatusActive && (result.Record.ExpiresAt == 0 || result.Record.ExpiresAt > now))
	return decision, evaluateErr
}
