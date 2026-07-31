package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type AutoPriceGuardState string

const (
	AutoPriceGuardStatePending     AutoPriceGuardState = "pending"
	AutoPriceGuardStateUsed        AutoPriceGuardState = "used"
	AutoPriceGuardStateInvalidated AutoPriceGuardState = "invalidated"
	AutoPriceGuardStateDeleting    AutoPriceGuardState = "deleting"
	AutoPriceGuardStateResolved    AutoPriceGuardState = "resolved"
	AutoPriceGuardStateDeleted     AutoPriceGuardState = "deleted"
)

// AutoPriceGuard intentionally has no association with Channel: guard
// tombstones must survive channel deletion and stale cache entries.
type AutoPriceGuard struct {
	ID                   int64               `json:"id" gorm:"primaryKey"`
	ChannelID            int                 `json:"channel_id" gorm:"index;not null"`
	State                AutoPriceGuardState `json:"state" gorm:"type:varchar(16);index;not null"`
	InitialRevision      int64               `json:"initial_revision" gorm:"not null"`
	InitialMissingModels string              `json:"initial_missing_models" gorm:"type:text"`
	InitialUsedQuota     int64               `json:"initial_used_quota" gorm:"not null"`
	Source               string              `json:"source" gorm:"type:text"`
	Reason               string              `json:"reason" gorm:"type:text"`
	CreatedAt            int64               `json:"created_at" gorm:"bigint;index"`
	UpdatedAt            int64               `json:"updated_at" gorm:"bigint;index"`
}

func (AutoPriceGuard) TableName() string {
	return "channel_auto_price_guards"
}

type AutoPriceGuardCASResult struct {
	Found        bool
	Transitioned bool
	State        AutoPriceGuardState
	ChannelID    int
	OwnerMatched bool
}

// UseChannelAutoPriceGuardCAS is the request-owned guard transition. Unlike
// the legacy generic CAS it binds the transition to the selected channel, so a
// stale/mis-associated cache entry can never consume another channel's guard.
func UseChannelAutoPriceGuardCAS(guardID int64, channelID int) (AutoPriceGuardCASResult, error) {
	return UseChannelAutoPriceGuardCASTx(DB, guardID, channelID)
}

func UseChannelAutoPriceGuardCASTx(tx *gorm.DB, guardID int64, channelID int) (AutoPriceGuardCASResult, error) {
	if tx == nil {
		return AutoPriceGuardCASResult{}, errors.New("auto price guard transaction is nil")
	}
	result := tx.Model(&AutoPriceGuard{}).Where("id = ? AND channel_id = ? AND state = ?", guardID, channelID, AutoPriceGuardStatePending).
		Updates(map[string]any{"state": AutoPriceGuardStateUsed, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return AutoPriceGuardCASResult{}, result.Error
	}
	if result.RowsAffected == 1 {
		return AutoPriceGuardCASResult{Found: true, Transitioned: true, State: AutoPriceGuardStateUsed, ChannelID: channelID, OwnerMatched: true}, nil
	}
	guard, err := GetAutoPriceGuardTx(tx, guardID)
	if err != nil {
		return AutoPriceGuardCASResult{}, err
	}
	if guard == nil {
		return AutoPriceGuardCASResult{}, nil
	}
	return AutoPriceGuardCASResult{Found: true, State: guard.State, ChannelID: guard.ChannelID, OwnerMatched: guard.ChannelID == channelID}, nil
}

func (guard *AutoPriceGuard) BeforeCreate(_ *gorm.DB) error {
	if guard.State == "" {
		guard.State = AutoPriceGuardStatePending
	}
	now := common.GetTimestamp()
	if guard.CreatedAt == 0 {
		guard.CreatedAt = now
	}
	if guard.UpdatedAt == 0 {
		guard.UpdatedAt = now
	}
	return nil
}

// GetAutoPriceGuard returns nil, nil for a missing guard, which is distinct
// from every persisted state including the deleted tombstone.
func GetAutoPriceGuard(id int64) (*AutoPriceGuard, error) {
	return GetAutoPriceGuardTx(DB, id)
}

func GetAutoPriceGuardTx(tx *gorm.DB, id int64) (*AutoPriceGuard, error) {
	if tx == nil {
		return nil, errors.New("auto price guard transaction is nil")
	}
	var guard AutoPriceGuard
	err := tx.Where("id = ?", id).First(&guard).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &guard, nil
}

func transitionAutoPriceGuardTx(tx *gorm.DB, id int64, to AutoPriceGuardState, reason string) (AutoPriceGuardCASResult, error) {
	if tx == nil {
		return AutoPriceGuardCASResult{}, errors.New("auto price guard transaction is nil")
	}
	result := tx.Model(&AutoPriceGuard{}).Where("id = ? AND state = ?", id, AutoPriceGuardStatePending).
		Updates(map[string]any{"state": to, "reason": reason, "updated_at": common.GetTimestamp()})
	if result.Error != nil {
		return AutoPriceGuardCASResult{}, result.Error
	}
	if result.RowsAffected == 1 {
		return AutoPriceGuardCASResult{Found: true, Transitioned: true, State: to}, nil
	}
	guard, err := GetAutoPriceGuardTx(tx, id)
	if err != nil {
		return AutoPriceGuardCASResult{}, err
	}
	if guard == nil {
		return AutoPriceGuardCASResult{}, nil
	}
	return AutoPriceGuardCASResult{Found: true, State: guard.State}, nil
}

func UseAutoPriceGuardCAS(id int64) (AutoPriceGuardCASResult, error) {
	return UseAutoPriceGuardCASTx(DB, id)
}

func UseAutoPriceGuardCASTx(tx *gorm.DB, id int64) (AutoPriceGuardCASResult, error) {
	return transitionAutoPriceGuardTx(tx, id, AutoPriceGuardStateUsed, "")
}

func UseAutoPriceGuardTx(tx *gorm.DB, id int64) (AutoPriceGuardCASResult, error) {
	return UseAutoPriceGuardCASTx(tx, id)
}

func DeleteAutoPriceGuardCAS(id int64) (AutoPriceGuardCASResult, error) {
	return DeleteAutoPriceGuardCASTx(DB, id)
}

func DeleteAutoPriceGuardCASTx(tx *gorm.DB, id int64) (AutoPriceGuardCASResult, error) {
	return transitionAutoPriceGuardTx(tx, id, AutoPriceGuardStateDeleting, "")
}

func DeleteAutoPriceGuardTx(tx *gorm.DB, id int64) (AutoPriceGuardCASResult, error) {
	return DeleteAutoPriceGuardCASTx(tx, id)
}

func InvalidateAutoPriceGuardCAS(id int64, reason string) (AutoPriceGuardCASResult, error) {
	return InvalidateAutoPriceGuardCASTx(DB, id, reason)
}

func InvalidateAutoPriceGuardCASTx(tx *gorm.DB, id int64, reason string) (AutoPriceGuardCASResult, error) {
	return transitionAutoPriceGuardTx(tx, id, AutoPriceGuardStateInvalidated, reason)
}

func InvalidateAutoPriceGuardTx(tx *gorm.DB, id int64, reason string) (AutoPriceGuardCASResult, error) {
	return InvalidateAutoPriceGuardCASTx(tx, id, reason)
}

// ResolveAutoPriceGuardTx closes a non-deleting guard after the price task has
// classified the channel as retained. Deleted guards remain durable
// tombstones and deleting guards can only use UpdateAutoPriceGuardTerminalTx.
func ResolveAutoPriceGuardTx(tx *gorm.DB, id int64, reason string) (bool, error) {
	if tx == nil {
		return false, errors.New("auto price guard transaction is nil")
	}
	result := tx.Model(&AutoPriceGuard{}).
		Where("id = ? AND state IN ?", id, []AutoPriceGuardState{
			AutoPriceGuardStatePending,
			AutoPriceGuardStateUsed,
			AutoPriceGuardStateInvalidated,
		}).
		Updates(map[string]any{"state": AutoPriceGuardStateResolved, "reason": reason, "updated_at": common.GetTimestamp()})
	return result.RowsAffected == 1, result.Error
}

// UpdateAutoPriceGuardTerminal updates a deleting guard to a terminal state.
// Deleted is a tombstone state, not a row deletion.
func UpdateAutoPriceGuardTerminal(id int64, state AutoPriceGuardState, reason string) (bool, error) {
	return UpdateAutoPriceGuardTerminalTx(DB, id, state, reason)
}

func UpdateAutoPriceGuardTerminalTx(tx *gorm.DB, id int64, state AutoPriceGuardState, reason string) (bool, error) {
	if tx == nil {
		return false, errors.New("auto price guard transaction is nil")
	}
	if state != AutoPriceGuardStateResolved && state != AutoPriceGuardStateDeleted {
		return false, errors.New("auto price guard terminal state must be resolved or deleted")
	}
	result := tx.Model(&AutoPriceGuard{}).Where("id = ? AND state = ?", id, AutoPriceGuardStateDeleting).
		Updates(map[string]any{"state": state, "reason": reason, "updated_at": common.GetTimestamp()})
	return result.RowsAffected == 1, result.Error
}
