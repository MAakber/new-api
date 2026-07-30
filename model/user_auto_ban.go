package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	AutoBanRecordStatusObserved = "observed"
	AutoBanRecordStatusActive   = "active"
	AutoBanRecordStatusReleased = "released"
	AutoBanRecordStatusExpired  = "expired"
)

var ErrAutoBanExemptUser = errors.New("user is exempt from automatic bans")

type UserSecurityEvent struct {
	Id        int64  `json:"id" gorm:"primaryKey"`
	UserId    int    `json:"user_id" gorm:"not null;index:idx_security_events_user_rule_time,priority:1"`
	RuleType  string `json:"rule_type" gorm:"type:varchar(32);not null;index:idx_security_events_user_rule_time,priority:2"`
	Subject   string `json:"subject" gorm:"type:varchar(255);not null;default:'';index:idx_security_events_subject"`
	Evidence  string `json:"evidence" gorm:"type:text;not null"`
	TokenId   int    `json:"token_id" gorm:"not null;default:0;index"`
	Ip        string `json:"ip" gorm:"type:varchar(64);not null;default:''"`
	UserAgent string `json:"user_agent" gorm:"type:varchar(512);not null;default:''"`
	RequestId string `json:"request_id" gorm:"type:varchar(64);not null;default:'';index"`
	CreatedAt int64  `json:"created_at" gorm:"type:bigint;not null;index:idx_security_events_user_rule_time,priority:3;index"`
}

type UserAutoBanRecord struct {
	Id                 int64  `json:"id" gorm:"primaryKey"`
	UserId             int    `json:"user_id" gorm:"not null;index:idx_auto_ban_records_user_status,priority:1"`
	Username           string `json:"username" gorm:"type:varchar(64);not null;default:'';index"`
	UserGroup          string `json:"user_group" gorm:"type:varchar(64);not null;default:''"`
	RuleType           string `json:"rule_type" gorm:"type:varchar(32);not null;index"`
	Mode               string `json:"mode" gorm:"type:varchar(16);not null"`
	Status             string `json:"status" gorm:"type:varchar(16);not null;index:idx_auto_ban_records_user_status,priority:2;index"`
	TriggerCount       int    `json:"trigger_count" gorm:"not null"`
	Threshold          int    `json:"threshold" gorm:"not null"`
	WindowMinutes      int    `json:"window_minutes" gorm:"not null"`
	BanDurationMinutes int    `json:"ban_duration_minutes" gorm:"not null"`
	ResponseStatus     int    `json:"response_status" gorm:"not null"`
	ResponseCode       string `json:"response_code" gorm:"type:varchar(64);not null"`
	ResponseMessage    string `json:"response_message" gorm:"type:varchar(500);not null"`
	Ip                 string `json:"ip" gorm:"type:varchar(64);not null;default:''"`
	UserAgent          string `json:"user_agent" gorm:"type:varchar(512);not null;default:''"`
	Evidence           string `json:"evidence" gorm:"type:text;not null"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint;not null;index"`
	ExpiresAt          int64  `json:"expires_at" gorm:"type:bigint;not null;default:0;index"`
	ReleasedAt         int64  `json:"released_at" gorm:"type:bigint;not null;default:0"`
	ReleasedBy         int    `json:"released_by" gorm:"not null;default:0"`
	ReleaseReason      string `json:"release_reason" gorm:"type:varchar(255);not null;default:''"`
}

type AutoBanResponse struct {
	Until   int64  `json:"until"`
	Rule    string `json:"rule"`
	Status  int    `json:"status"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type AutoBanActionInput struct {
	UserId             int
	RuleType           string
	Mode               string
	TriggerCount       int
	Threshold          int
	WindowMinutes      int
	BanDurationMinutes int
	ResponseStatus     int
	ResponseCode       string
	ResponseMessage    string
	Ip                 string
	UserAgent          string
	Evidence           string
}

type AutoBanRecordQuery struct {
	Page     int
	PageSize int
	UserId   int
	RuleType string
	Status   string
}

type UserSecuritySubjectLastSeen struct {
	Subject  string `json:"subject"`
	LastSeen int64  `json:"last_seen"`
}

func normalizeAutoBanResponse(until int64, rule string, status int, code string, message string) (AutoBanResponse, bool) {
	if until != -1 && until <= time.Now().Unix() {
		return AutoBanResponse{}, false
	}
	if status < 400 || status > 599 {
		status = 403
	}
	code = strings.TrimSpace(code)
	if code == "" {
		code = "account_temporarily_banned"
	}
	message = strings.TrimSpace(message)
	if message == "" {
		message = "Account temporarily restricted by an automated security rule."
	}
	return AutoBanResponse{Until: until, Rule: rule, Status: status, Code: code, Message: message}, true
}

func (user *User) ActiveAutoBan() (AutoBanResponse, bool) {
	if user == nil {
		return AutoBanResponse{}, false
	}
	return normalizeAutoBanResponse(user.AutoBanUntil, user.AutoBanRule, user.AutoBanStatus, user.AutoBanCode, user.AutoBanMessage)
}

func (user *UserBase) ActiveAutoBan() (AutoBanResponse, bool) {
	if user == nil {
		return AutoBanResponse{}, false
	}
	return normalizeAutoBanResponse(user.AutoBanUntil, user.AutoBanRule, user.AutoBanStatus, user.AutoBanCode, user.AutoBanMessage)
}

func CreateUserSecurityEvent(event *UserSecurityEvent) error {
	if event == nil || event.UserId <= 0 || strings.TrimSpace(event.RuleType) == "" {
		return fmt.Errorf("invalid user security event")
	}
	if event.CreatedAt <= 0 {
		event.CreatedAt = time.Now().Unix()
	}
	return DB.Create(event).Error
}

func HasUserSecuritySubjectSince(userId int, ruleType string, subject string, since int64) (bool, error) {
	var count int64
	err := DB.Model(&UserSecurityEvent{}).
		Where("user_id = ? AND rule_type = ? AND subject = ? AND created_at >= ?", userId, ruleType, subject, since).
		Limit(1).Count(&count).Error
	return count > 0, err
}

func LoadUserSecuritySubjectsSince(userId int, ruleType string, since int64) ([]string, error) {
	var subjects []string
	err := DB.Model(&UserSecurityEvent{}).
		Where("user_id = ? AND rule_type = ? AND created_at >= ?", userId, ruleType, since).
		Distinct("subject").Pluck("subject", &subjects).Error
	return subjects, err
}

func LoadUserSecuritySubjectLastSeenSince(userId int, ruleType string, since int64) ([]UserSecuritySubjectLastSeen, error) {
	var rows []UserSecuritySubjectLastSeen
	err := DB.Model(&UserSecurityEvent{}).
		Select("subject, MAX(created_at) AS last_seen").
		Where("user_id = ? AND rule_type = ? AND created_at >= ?", userId, ruleType, since).
		Group("subject").Scan(&rows).Error
	return rows, err
}

func CountUserSecurityEventsSince(userId int, ruleType string, since int64) (int64, error) {
	var count int64
	err := DB.Model(&UserSecurityEvent{}).
		Where("user_id = ? AND rule_type = ? AND created_at >= ?", userId, ruleType, since).
		Count(&count).Error
	return count, err
}

func CountDistinctUserSecuritySubjectsSince(userId int, ruleType string, since int64) (int64, error) {
	var count int64
	err := DB.Model(&UserSecurityEvent{}).
		Where("user_id = ? AND rule_type = ? AND created_at >= ?", userId, ruleType, since).
		Distinct("subject").Count(&count).Error
	return count, err
}

func CreateObservedAutoBanRecord(input AutoBanActionInput) (*UserAutoBanRecord, bool, error) {
	now := time.Now().Unix()
	cutoff := now - int64(input.WindowMinutes*60)
	var created bool
	var record UserAutoBanRecord
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Select("id", "username", "role", "group").Where("id = ?", input.UserId).First(&user).Error; err != nil {
			return err
		}
		if user.Role >= common.RoleAdminUser {
			return ErrAutoBanExemptUser
		}
		var existing UserAutoBanRecord
		err := tx.Where("user_id = ? AND rule_type = ? AND status = ? AND created_at >= ?", input.UserId, input.RuleType, AutoBanRecordStatusObserved, cutoff).
			Order("id DESC").First(&existing).Error
		if err == nil {
			record = existing
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		record = newAutoBanRecord(input, user, AutoBanRecordStatusObserved, now, 0)
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	return &record, created, err
}

func newAutoBanRecord(input AutoBanActionInput, user User, status string, createdAt int64, expiresAt int64) UserAutoBanRecord {
	return UserAutoBanRecord{
		UserId:             input.UserId,
		Username:           user.Username,
		UserGroup:          user.Group,
		RuleType:           input.RuleType,
		Mode:               input.Mode,
		Status:             status,
		TriggerCount:       input.TriggerCount,
		Threshold:          input.Threshold,
		WindowMinutes:      input.WindowMinutes,
		BanDurationMinutes: input.BanDurationMinutes,
		ResponseStatus:     input.ResponseStatus,
		ResponseCode:       input.ResponseCode,
		ResponseMessage:    input.ResponseMessage,
		Ip:                 input.Ip,
		UserAgent:          input.UserAgent,
		Evidence:           input.Evidence,
		CreatedAt:          createdAt,
		ExpiresAt:          expiresAt,
	}
}

func ApplyUserAutoBan(input AutoBanActionInput) (*UserAutoBanRecord, bool, error) {
	now := time.Now().Unix()
	expiresAt := int64(0)
	if input.BanDurationMinutes != -1 {
		expiresAt = now + int64(input.BanDurationMinutes*60)
	}
	var record UserAutoBanRecord
	var applied bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Where("id = ?", input.UserId).First(&user).Error; err != nil {
			return err
		}
		if user.Role >= common.RoleAdminUser {
			return ErrAutoBanExemptUser
		}
		if user.AutoBanUntil == -1 || user.AutoBanUntil > now {
			if user.AutoBanRecordId > 0 {
				if err := tx.First(&record, user.AutoBanRecordId).Error; err != nil {
					return err
				}
			}
			return nil
		}
		if user.AutoBanRecordId > 0 {
			_ = tx.Model(&UserAutoBanRecord{}).
				Where("id = ? AND status = ?", user.AutoBanRecordId, AutoBanRecordStatusActive).
				Updates(map[string]interface{}{"status": AutoBanRecordStatusExpired}).Error
		}

		record = newAutoBanRecord(input, user, AutoBanRecordStatusActive, now, expiresAt)
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, user.Id); err != nil {
			return err
		}
		banUntil := expiresAt
		if input.BanDurationMinutes == -1 {
			banUntil = -1
		}
		updates := map[string]interface{}{
			"auto_ban_until":            banUntil,
			"auto_ban_rule":             input.RuleType,
			"auto_ban_record_id":        record.Id,
			"auto_ban_response_status":  input.ResponseStatus,
			"auto_ban_response_code":    input.ResponseCode,
			"auto_ban_response_message": input.ResponseMessage,
		}
		if err := tx.Model(&User{}).Where("id = ?", user.Id).Updates(updates).Error; err != nil {
			return err
		}
		applied = true
		return nil
	})
	if err != nil || !applied {
		return &record, applied, err
	}
	if err := PublishUserAuthCache(input.UserId); err != nil {
		return &record, true, err
	}
	if _, err := RevokeAllUserSessions(input.UserId, "automatic_security_ban"); err != nil {
		return &record, true, err
	}
	return &record, true, nil
}

func ReleaseUserAutoBan(userId int, operatorId int, reason string) (bool, error) {
	var changed bool
	err := DB.Transaction(func(tx *gorm.DB) error {
		var user User
		if err := lockForUpdate(tx).Where("id = ?", userId).First(&user).Error; err != nil {
			return err
		}
		if user.AutoBanUntil == 0 && user.AutoBanRecordId == 0 {
			return nil
		}
		if _, err := IncrementUserAuthVersionWithTx(tx, user.Id); err != nil {
			return err
		}
		updates := map[string]interface{}{
			"auto_ban_until":            0,
			"auto_ban_rule":             "",
			"auto_ban_record_id":        0,
			"auto_ban_response_status":  403,
			"auto_ban_response_code":    "",
			"auto_ban_response_message": "",
		}
		if err := tx.Model(&User{}).Where("id = ?", user.Id).Updates(updates).Error; err != nil {
			return err
		}
		now := time.Now().Unix()
		if err := tx.Model(&UserAutoBanRecord{}).
			Where("user_id = ? AND status = ?", user.Id, AutoBanRecordStatusActive).
			Updates(map[string]interface{}{
				"status":         AutoBanRecordStatusReleased,
				"released_at":    now,
				"released_by":    operatorId,
				"release_reason": strings.TrimSpace(reason),
			}).Error; err != nil {
			return err
		}
		changed = true
		return nil
	})
	if err != nil || !changed {
		return changed, err
	}
	if err := PublishUserAuthCache(userId); err != nil {
		return true, err
	}
	if _, err := RevokeAllUserSessions(userId, "automatic_security_ban_released"); err != nil {
		return true, err
	}
	return true, nil
}

func ListUserAutoBanRecords(query AutoBanRecordQuery) ([]*UserAutoBanRecord, int64, error) {
	now := time.Now().Unix()
	if err := DB.Model(&UserAutoBanRecord{}).
		Where("status = ? AND expires_at > 0 AND expires_at <= ?", AutoBanRecordStatusActive, now).
		Update("status", AutoBanRecordStatusExpired).Error; err != nil {
		return nil, 0, err
	}
	if query.Page < 1 {
		query.Page = 1
	}
	if query.PageSize < 1 {
		query.PageSize = 20
	}
	if query.PageSize > 100 {
		query.PageSize = 100
	}
	tx := DB.Model(&UserAutoBanRecord{})
	if query.UserId > 0 {
		tx = tx.Where("user_id = ?", query.UserId)
	}
	if query.RuleType != "" {
		tx = tx.Where("rule_type = ?", query.RuleType)
	}
	if query.Status != "" {
		tx = tx.Where("status = ?", query.Status)
	}
	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var records []*UserAutoBanRecord
	err := tx.Order("id DESC").Offset((query.Page - 1) * query.PageSize).Limit(query.PageSize).Find(&records).Error
	return records, total, err
}

func DeleteUserSecurityEventsBefore(before int64) error {
	return DB.Where("created_at < ?", before).Delete(&UserSecurityEvent{}).Error
}
