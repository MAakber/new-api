package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	ChannelCustomBalanceOperationBalance = "balance"
	ChannelCustomBalanceOperationCheckin = "checkin"
)

// ChannelCustomBalance stores the durable configuration and execution state
// for a channel's compatible New API balance/check-in integration. Credentials
// are encrypted before they reach this model and are intentionally excluded
// from JSON serialization.
type ChannelCustomBalance struct {
	ChannelID           int     `json:"channel_id" gorm:"primaryKey"`
	Enabled             bool    `json:"enabled"`
	Provider            string  `json:"provider" gorm:"type:varchar(32);index"`
	UseChannelKey       bool    `json:"use_channel_key"`
	AuthType            string  `json:"auth_type" gorm:"type:varchar(16)"`
	EncryptedCredential string  `json:"-" gorm:"type:text"`
	UserID              string  `json:"user_id" gorm:"type:varchar(128)"`
	QuotaPerUnit        float64 `json:"quota_per_unit"`
	AutoBalance         bool    `json:"auto_balance"`
	AutoCheckin         bool    `json:"auto_checkin"`
	BalanceInterval     int64   `json:"balance_interval_seconds" gorm:"bigint"`
	CheckinInterval     int64   `json:"checkin_interval_seconds" gorm:"bigint"`
	RetryMax            int     `json:"retry_max"`
	RetryInterval       int64   `json:"retry_interval_seconds" gorm:"bigint"`

	BalanceRetryCount int `json:"balance_retry_count"`
	CheckinRetryCount int `json:"checkin_retry_count"`

	NextBalanceAt int64 `json:"next_balance_at" gorm:"bigint;index"`
	NextCheckinAt int64 `json:"next_checkin_at" gorm:"bigint;index"`
	LastBalanceAt int64 `json:"last_balance_at" gorm:"bigint"`
	LastCheckinAt int64 `json:"last_checkin_at" gorm:"bigint"`

	LastBalanceStatus  string `json:"last_balance_status" gorm:"type:varchar(32)"`
	LastBalanceError   string `json:"last_balance_error" gorm:"type:varchar(512)"`
	LastBalanceMessage string `json:"last_balance_message" gorm:"type:varchar(512)"`
	LastCheckinStatus  string `json:"last_checkin_status" gorm:"type:varchar(32)"`
	LastCheckinError   string `json:"last_checkin_error" gorm:"type:varchar(512)"`
	LastCheckinMessage string `json:"last_checkin_message" gorm:"type:varchar(512)"`

	CreatedAt int64 `json:"created_at" gorm:"bigint"`
	UpdatedAt int64 `json:"updated_at" gorm:"bigint"`
}

func (config *ChannelCustomBalance) BeforeCreate(_ *gorm.DB) error {
	now := common.GetTimestamp()
	if config.CreatedAt == 0 {
		config.CreatedAt = now
	}
	if config.UpdatedAt == 0 {
		config.UpdatedAt = now
	}
	return nil
}

func (config *ChannelCustomBalance) BeforeUpdate(_ *gorm.DB) error {
	config.UpdatedAt = common.GetTimestamp()
	return nil
}

func GetChannelCustomBalance(channelID int) (*ChannelCustomBalance, error) {
	if channelID <= 0 {
		return nil, errors.New("invalid channel id")
	}
	var config ChannelCustomBalance
	err := DB.Where("channel_id = ?", channelID).First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func DeleteChannelCustomBalanceTx(tx *gorm.DB, channelID int) error {
	if tx == nil {
		return errors.New("channel custom balance transaction is nil")
	}
	if channelID <= 0 || !tx.Migrator().HasTable(&ChannelCustomBalance{}) {
		return nil
	}
	return tx.Where("channel_id = ?", channelID).Delete(&ChannelCustomBalance{}).Error
}

func DeleteChannelCustomBalancesTx(tx *gorm.DB, channelIDs []int) error {
	if tx == nil {
		return errors.New("channel custom balance transaction is nil")
	}
	if len(channelIDs) == 0 || !tx.Migrator().HasTable(&ChannelCustomBalance{}) {
		return nil
	}
	return tx.Where("channel_id IN ?", channelIDs).Delete(&ChannelCustomBalance{}).Error
}

func ListDueChannelCustomBalances(operation string, now int64) ([]*ChannelCustomBalance, error) {
	if operation != ChannelCustomBalanceOperationBalance && operation != ChannelCustomBalanceOperationCheckin {
		return nil, errors.New("invalid channel custom balance operation")
	}
	query := DB.Where("enabled = ?", true)
	if operation == ChannelCustomBalanceOperationBalance {
		query = query.Where("auto_balance = ? AND (next_balance_at = 0 OR next_balance_at <= ?)", true, now)
	} else {
		query = query.Where("auto_checkin = ? AND (next_checkin_at = 0 OR next_checkin_at <= ?)", true, now)
	}
	var configs []*ChannelCustomBalance
	if err := query.Order("channel_id asc").Limit(100).Find(&configs).Error; err != nil {
		return nil, err
	}
	return configs, nil
}

func HasDueChannelCustomBalance(operation string, now int64) (bool, error) {
	configs, err := ListDueChannelCustomBalances(operation, now)
	return len(configs) > 0, err
}
