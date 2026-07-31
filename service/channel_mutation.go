package service

import (
	"errors"
	"reflect"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ChannelMutationTrigger is persisted in the outbox and is deliberately a
// small closed set rather than controller-provided free-form text.
type ChannelMutationTrigger string

const (
	ChannelMutationTriggerCreate            ChannelMutationTrigger = "create"
	ChannelMutationTriggerCopy              ChannelMutationTrigger = "copy"
	ChannelMutationTriggerUpdate            ChannelMutationTrigger = "update"
	ChannelMutationTriggerReenable          ChannelMutationTrigger = "reenable"
	ChannelMutationTriggerTagUpdate         ChannelMutationTrigger = "tag_update"
	ChannelMutationTriggerTagReenable       ChannelMutationTrigger = "tag_reenable"
	ChannelMutationTriggerMultiKeyUpdate    ChannelMutationTrigger = "multi_key_update"
	ChannelMutationTriggerUpstreamApply     ChannelMutationTrigger = "upstream_apply"
	ChannelMutationTriggerUpstreamAutoApply ChannelMutationTrigger = "upstream_auto_apply"
)

func (t ChannelMutationTrigger) valid() bool {
	switch t {
	case ChannelMutationTriggerCreate, ChannelMutationTriggerCopy, ChannelMutationTriggerUpdate, ChannelMutationTriggerReenable, ChannelMutationTriggerTagUpdate, ChannelMutationTriggerTagReenable, ChannelMutationTriggerMultiKeyUpdate, ChannelMutationTriggerUpstreamApply, ChannelMutationTriggerUpstreamAutoApply:
		return true
	default:
		return false
	}
}

type ChannelMutationUpdateResult struct {
	Current              *model.Channel
	Updated              *model.Channel
	ConfigChanged        bool
	ModelsChanged        bool
	ModelMappingChanged  bool
	TypeChanged          bool
	BaseURLChanged       bool
	EventsAppended       bool
	CacheRefreshRequired bool
}

type ChannelStatusMutationResult struct {
	ChannelID            int
	OldStatus            int
	NewStatus            int
	Changed              bool
	EventsAppended       bool
	CacheRefreshRequired bool
}

type ChannelStatusBatchMutationResult struct {
	ChangedCount int
	Channels     []ChannelStatusMutationResult
}

// CreateChannels persists a create/copy batch atomically. The caller performs
// cache publication, auditing, and any runner wake only after this returns.
func CreateChannels(channels []model.Channel, trigger ChannelMutationTrigger) ([]model.Channel, error) {
	var result []model.Channel
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = CreateChannelsTx(tx, channels, trigger)
		return err
	})
	return result, err
}

func CreateChannelsTx(tx *gorm.DB, channels []model.Channel, trigger ChannelMutationTrigger) ([]model.Channel, error) {
	if tx == nil {
		return nil, errors.New("channel mutation transaction is nil")
	}
	if !trigger.valid() || (trigger != ChannelMutationTriggerCreate && trigger != ChannelMutationTriggerCopy) {
		return nil, errors.New("invalid channel create trigger")
	}
	if len(channels) == 0 {
		return channels, nil
	}
	config, err := LoadChannelAutoSyncConfigTx(tx)
	if err != nil {
		return nil, err
	}
	now := common.GetTimestamp()
	for i := range channels {
		channel := &channels[i]
		channel.AutoPriceGuardID = 0 // copies must never inherit a live guard.
		channel.ConfigRevision = 1
		if err := channel.InsertTx(tx); err != nil {
			return nil, err
		}
		var guard *model.AutoPriceGuard
		if config.PriceEnabled {
			guard, err = BuildChannelAutoPriceGuardTx(tx, channel, config, now)
			if err != nil {
				return nil, err
			}
			if err := tx.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("auto_price_guard_id", guard.ID).Error; err != nil {
				return nil, err
			}
		}
		if err := AppendChannelAutoSyncEventsTx(tx, channel, config, string(trigger), guard, now); err != nil {
			return nil, err
		}
	}
	return channels, nil
}

func UpdateChannel(next *model.Channel, trigger ChannelMutationTrigger) (*ChannelMutationUpdateResult, error) {
	var result *ChannelMutationUpdateResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = UpdateChannelTx(tx, next, trigger)
		return err
	})
	return result, err
}

// UpdateChannelTx applies an already merged administrator edit. Runtime state
// is always taken from the locked row, never from a JSON request body.
func UpdateChannelTx(tx *gorm.DB, next *model.Channel, trigger ChannelMutationTrigger) (*ChannelMutationUpdateResult, error) {
	if tx == nil || next == nil || next.Id == 0 {
		return nil, errors.New("invalid channel update mutation")
	}
	if !trigger.valid() || trigger == ChannelMutationTriggerCreate || trigger == ChannelMutationTriggerCopy {
		return nil, errors.New("invalid channel update trigger")
	}
	var current model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", next.Id).Error; err != nil {
		return nil, err
	}
	updated := administratorChannel(current, *next)
	result := &ChannelMutationUpdateResult{Current: &current, Updated: &updated}
	result.ConfigChanged = !reflect.DeepEqual(adminConfigSnapshot(current), adminConfigSnapshot(updated))
	result.ModelsChanged = current.Models != updated.Models
	result.ModelMappingChanged = !reflect.DeepEqual(current.ModelMapping, updated.ModelMapping)
	result.TypeChanged = current.Type != updated.Type
	result.BaseURLChanged = !reflect.DeepEqual(current.BaseURL, updated.BaseURL)
	if !result.ConfigChanged {
		return result, nil
	}
	updated.ConfigRevision = current.ConfigRevision + 1
	if updated.ConfigRevision < 1 {
		updated.ConfigRevision = 1
	}
	if current.AutoPriceGuardID != 0 {
		if _, err := model.InvalidateAutoPriceGuardTx(tx, current.AutoPriceGuardID, "administrator configuration changed"); err != nil {
			return nil, err
		}
	}
	updated.AutoPriceGuardID = 0
	if err := updateAdministratorChannelTx(tx, &updated); err != nil {
		return nil, err
	}
	if result.ModelsChanged || result.ModelMappingChanged || result.TypeChanged || result.BaseURLChanged {
		config, err := LoadChannelAutoSyncConfigTx(tx)
		if err != nil {
			return nil, err
		}
		if err := AppendChannelAutoSyncEventsTx(tx, &updated, config, string(trigger), nil, common.GetTimestamp()); err != nil {
			return nil, err
		}
		result.EventsAppended = config.PriceEnabled || config.MetadataEnabled
	}
	result.Updated = &updated
	result.CacheRefreshRequired = true
	return result, nil
}

func UpdateChannelStatuses(ids []int, status int) (*ChannelStatusBatchMutationResult, error) {
	var result *ChannelStatusBatchMutationResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = UpdateChannelStatusesTx(tx, ids, status)
		return err
	})
	return result, err
}

func UpdateChannelStatusesTx(tx *gorm.DB, ids []int, status int) (*ChannelStatusBatchMutationResult, error) {
	return updateChannelStatusesTx(tx, ids, status, ChannelMutationTriggerReenable)
}

func updateChannelStatusesTx(tx *gorm.DB, ids []int, status int, trigger ChannelMutationTrigger) (*ChannelStatusBatchMutationResult, error) {
	if tx == nil {
		return nil, errors.New("channel status mutation transaction is nil")
	}
	result := &ChannelStatusBatchMutationResult{Channels: make([]ChannelStatusMutationResult, 0, len(ids))}
	for _, id := range ids {
		var current model.Channel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", id).Error; err != nil {
			return nil, err
		}
		item := ChannelStatusMutationResult{ChannelID: id, OldStatus: current.Status, NewStatus: status}
		if current.Status == status {
			result.Channels = append(result.Channels, item)
			continue
		}
		if current.AutoPriceGuardID != 0 {
			if _, err := model.InvalidateAutoPriceGuardTx(tx, current.AutoPriceGuardID, "administrator status changed"); err != nil {
				return nil, err
			}
		}
		current.Status = status
		current.AutoPriceGuardID = 0
		current.ConfigRevision++
		if current.ConfigRevision < 1 {
			current.ConfigRevision = 1
		}
		if err := tx.Model(&model.Channel{}).Where("id = ?", id).Updates(map[string]any{
			"status": status, "auto_price_guard_id": int64(0), "config_revision": current.ConfigRevision,
		}).Error; err != nil {
			return nil, err
		}
		if err := tx.Model(&model.Ability{}).Where("channel_id = ?", id).Update("enabled", status == common.ChannelStatusEnabled).Error; err != nil {
			return nil, err
		}
		if item.OldStatus != common.ChannelStatusEnabled && status == common.ChannelStatusEnabled {
			config, err := LoadChannelAutoSyncConfigTx(tx)
			if err != nil {
				return nil, err
			}
			if err := AppendChannelAutoSyncEventsTx(tx, &current, config, string(trigger), nil, common.GetTimestamp()); err != nil {
				return nil, err
			}
			item.EventsAppended = config.PriceEnabled || config.MetadataEnabled
		}
		item.Changed = true
		item.CacheRefreshRequired = true
		result.ChangedCount++
		result.Channels = append(result.Channels, item)
	}
	return result, nil
}

// UpdateChannelStatusesByTag applies an administrator status mutation to a
// tag snapshot atomically. An empty match is a successful no-op.
func UpdateChannelStatusesByTag(tag string, status int) (*ChannelStatusBatchMutationResult, error) {
	var result *ChannelStatusBatchMutationResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = UpdateChannelStatusesByTagTx(tx, tag, status)
		return err
	})
	return result, err
}

func UpdateChannelStatusesByTagTx(tx *gorm.DB, tag string, status int) (*ChannelStatusBatchMutationResult, error) {
	if tx == nil {
		return nil, errors.New("channel tag status mutation transaction is nil")
	}
	var channels []model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("tag = ?", tag).Find(&channels).Error; err != nil {
		return nil, err
	}
	ids := make([]int, len(channels))
	for i := range channels {
		ids[i] = channels[i].Id
	}
	return updateChannelStatusesTx(tx, ids, status, ChannelMutationTriggerTagReenable)
}

type ChannelTagMutationInput struct {
	Tag                                  string
	NewTag, ModelMapping, Models, Groups *string
	Priority                             *int64
	Weight                               *uint
	ParamOverride, HeaderOverride        *string
}

type ChannelTagMutationResult struct {
	MatchedCount int
	ChangedCount int
	EventsCount  int
}

func UpdateChannelsByTag(input ChannelTagMutationInput) (*ChannelTagMutationResult, error) {
	var result *ChannelTagMutationResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = UpdateChannelsByTagTx(tx, input)
		return err
	})
	return result, err
}

func UpdateChannelsByTagTx(tx *gorm.DB, input ChannelTagMutationInput) (*ChannelTagMutationResult, error) {
	if tx == nil {
		return nil, errors.New("channel tag mutation transaction is nil")
	}
	var channels []model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("tag = ?", input.Tag).Find(&channels).Error; err != nil {
		return nil, err
	}
	result := &ChannelTagMutationResult{MatchedCount: len(channels)}
	for i := range channels {
		current := channels[i]
		next := current
		if input.NewTag != nil && *input.NewTag != current.GetTag() {
			next.Tag = input.NewTag
		}
		if input.ModelMapping != nil {
			next.ModelMapping = input.ModelMapping
		}
		if input.Models != nil && *input.Models != "" {
			next.Models = *input.Models
		}
		if input.Groups != nil && *input.Groups != "" {
			next.Group = *input.Groups
		}
		if input.Priority != nil {
			next.Priority = input.Priority
		}
		if input.Weight != nil {
			next.Weight = input.Weight
		}
		if input.ParamOverride != nil {
			next.ParamOverride = input.ParamOverride
		}
		if input.HeaderOverride != nil {
			next.HeaderOverride = input.HeaderOverride
		}
		updated, err := UpdateChannelTx(tx, &next, ChannelMutationTriggerTagUpdate)
		if err != nil {
			return nil, err
		}
		if updated.ConfigChanged {
			result.ChangedCount++
		}
		if updated.EventsAppended {
			result.EventsCount++
		}
	}
	return result, nil
}

type ChannelKeyConfigurationMutationResult struct {
	Current              *model.Channel
	Updated              *model.Channel
	Changed              bool
	CacheRefreshRequired bool
}

// ErrChannelUpstreamModelsConflict prevents a stale discovery/apply result
// from overwriting a concurrent administrator model edit.
var ErrChannelUpstreamModelsConflict = errors.New("channel upstream models conflict")
var ErrChannelMutationRevisionConflict = errors.New("channel configuration revision conflict")

// ChannelAdminPatchInput is the controller-facing optimistic-concurrency patch
// contract. Fields contains only JSON fields actually supplied by the client.
type ChannelAdminPatchInput struct {
	ChannelID        int
	ExpectedRevision int64
	Patch            model.Channel
	Fields           map[string]bool
	Trigger          ChannelMutationTrigger
}

func UpdateChannelAdminPatch(input ChannelAdminPatchInput) (*ChannelMutationUpdateResult, error) {
	var result *ChannelMutationUpdateResult
	err := model.DB.Transaction(func(tx *gorm.DB) error { var err error; result, err = UpdateChannelAdminPatchTx(tx, input); return err })
	return result, err
}

func UpdateChannelAdminPatchTx(tx *gorm.DB, input ChannelAdminPatchInput) (*ChannelMutationUpdateResult, error) {
	if tx == nil || input.ChannelID == 0 {
		return nil, errors.New("invalid channel admin patch")
	}
	var current model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", input.ChannelID).Error; err != nil {
		return nil, err
	}
	if current.ConfigRevision != input.ExpectedRevision {
		return nil, ErrChannelMutationRevisionConflict
	}
	next := current
	for field := range input.Fields {
		switch field {
		case "type":
			next.Type = input.Patch.Type
		case "key":
			if input.Patch.Key != "" {
				next.Key = input.Patch.Key
			} // legacy empty-key no-op
		case "openai_organization":
			next.OpenAIOrganization = input.Patch.OpenAIOrganization
		case "test_model":
			next.TestModel = input.Patch.TestModel
		case "name":
			next.Name = input.Patch.Name
		case "weight":
			next.Weight = input.Patch.Weight
		case "base_url":
			next.BaseURL = input.Patch.BaseURL
		case "other":
			next.Other = input.Patch.Other
		case "models":
			next.Models = input.Patch.Models
		case "group":
			next.Group = input.Patch.Group
		case "model_mapping":
			next.ModelMapping = input.Patch.ModelMapping
		case "status_code_mapping":
			next.StatusCodeMapping = input.Patch.StatusCodeMapping
		case "priority":
			next.Priority = input.Patch.Priority
		case "auto_ban":
			next.AutoBan = input.Patch.AutoBan
		case "other_info":
			next.OtherInfo = input.Patch.OtherInfo
		case "tag":
			next.Tag = input.Patch.Tag
		case "setting":
			next.Setting = input.Patch.Setting
		case "param_override":
			next.ParamOverride = input.Patch.ParamOverride
		case "header_override":
			next.HeaderOverride = input.Patch.HeaderOverride
		case "remark":
			next.Remark = input.Patch.Remark
		case "channel_info":
			next.ChannelInfo.IsMultiKey, next.ChannelInfo.MultiKeySize, next.ChannelInfo.MultiKeyMode = input.Patch.ChannelInfo.IsMultiKey, input.Patch.ChannelInfo.MultiKeySize, input.Patch.ChannelInfo.MultiKeyMode
		case "multi_key_mode":
			next.ChannelInfo.MultiKeyMode = input.Patch.ChannelInfo.MultiKeyMode
		case "settings":
			next.OtherSettings = input.Patch.OtherSettings
		default:
			return nil, errors.New("invalid channel admin patch field")
		}
	}
	return UpdateChannelTx(tx, &next, input.Trigger)
}

type ChannelRuntimeMultiKeyMutation struct {
	ChannelID        int
	ExpectedRevision int64
	ChannelInfo      model.ChannelInfo
}

func UpdateChannelRuntimeMultiKey(input ChannelRuntimeMultiKeyMutation) error {
	return model.DB.Transaction(func(tx *gorm.DB) error { return UpdateChannelRuntimeMultiKeyTx(tx, input) })
}

func UpdateChannelRuntimeMultiKeyTx(tx *gorm.DB, input ChannelRuntimeMultiKeyMutation) error {
	if tx == nil || input.ChannelID == 0 {
		return errors.New("invalid runtime multi-key mutation")
	}
	var current model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", input.ChannelID).Error; err != nil {
		return err
	}
	if current.ConfigRevision != input.ExpectedRevision {
		return ErrChannelMutationRevisionConflict
	}
	info := current.ChannelInfo
	info.MultiKeyStatusList, info.MultiKeyDisabledReason, info.MultiKeyDisabledTime, info.MultiKeyPollingIndex = input.ChannelInfo.MultiKeyStatusList, input.ChannelInfo.MultiKeyDisabledReason, input.ChannelInfo.MultiKeyDisabledTime, input.ChannelInfo.MultiKeyPollingIndex
	return tx.Model(&model.Channel{}).Where("id = ?", current.Id).Update("channel_info", info).Error
}

func BatchSetChannelTags(ids []int, tag *string) (int, error) {
	changed := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error { var err error; changed, err = BatchSetChannelTagsTx(tx, ids, tag); return err })
	return changed, err
}

func BatchSetChannelTagsTx(tx *gorm.DB, ids []int, tag *string) (int, error) {
	if tx == nil {
		return 0, errors.New("channel batch tag mutation transaction is nil")
	}
	seen := map[int]struct{}{}
	changed := 0
	for _, id := range ids {
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		var current model.Channel
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", id).Error; err != nil {
			return 0, err
		}
		if reflect.DeepEqual(current.Tag, tag) {
			continue
		}
		if current.AutoPriceGuardID != 0 {
			if _, err := model.InvalidateAutoPriceGuardTx(tx, current.AutoPriceGuardID, "administrator tag changed"); err != nil {
				return 0, err
			}
		}
		current.Tag, current.AutoPriceGuardID, current.ConfigRevision = tag, 0, current.ConfigRevision+1
		if current.ConfigRevision < 1 {
			current.ConfigRevision = 1
		}
		if err := tx.Model(&model.Channel{}).Where("id = ?", id).Updates(map[string]any{"tag": tag, "auto_price_guard_id": int64(0), "config_revision": current.ConfigRevision}).Error; err != nil {
			return 0, err
		}
		if err := current.UpdateAbilities(tx); err != nil {
			return 0, err
		}
		changed++
	}
	return changed, nil
}

type PersistChannelUpstreamModelMutation struct {
	ChannelID             int
	ExpectedRevision      int64
	ExpectedModels        string
	ExpectedOtherSettings string
	NextModels            string
	OtherSettings         string
	Trigger               ChannelMutationTrigger
}

type ChannelUpstreamModelMutationResult struct {
	Current              *model.Channel
	Updated              *model.Channel
	ModelsChanged        bool
	EventsAppended       bool
	CacheRefreshRequired bool
}

func PersistChannelUpstreamModels(input PersistChannelUpstreamModelMutation) (*ChannelUpstreamModelMutationResult, error) {
	var result *ChannelUpstreamModelMutationResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = PersistChannelUpstreamModelMutationTx(tx, input)
		return err
	})
	return result, err
}

func PersistChannelUpstreamModelMutationTx(tx *gorm.DB, input PersistChannelUpstreamModelMutation) (*ChannelUpstreamModelMutationResult, error) {
	if tx == nil || input.ChannelID == 0 {
		return nil, errors.New("invalid upstream channel mutation")
	}
	if input.Trigger != ChannelMutationTriggerUpstreamApply && input.Trigger != ChannelMutationTriggerUpstreamAutoApply {
		return nil, errors.New("invalid upstream channel mutation trigger")
	}
	var current model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", input.ChannelID).Error; err != nil {
		return nil, err
	}
	result := &ChannelUpstreamModelMutationResult{Current: &current, Updated: &current}
	if current.ConfigRevision != input.ExpectedRevision || current.Models != input.ExpectedModels || current.OtherSettings != input.ExpectedOtherSettings {
		return nil, ErrChannelUpstreamModelsConflict
	}
	modelsChanged := current.Models != input.NextModels
	if !modelsChanged {
		if current.OtherSettings != input.OtherSettings {
			if err := tx.Model(&model.Channel{}).Where("id = ?", current.Id).Update("settings", input.OtherSettings).Error; err != nil {
				return nil, err
			}
			updated := current
			updated.OtherSettings = input.OtherSettings
			result.Updated = &updated
		}
		return result, nil
	}
	if current.Models != input.ExpectedModels {
		return nil, ErrChannelUpstreamModelsConflict
	}
	if current.AutoPriceGuardID != 0 {
		if _, err := model.InvalidateAutoPriceGuardTx(tx, current.AutoPriceGuardID, "upstream models changed"); err != nil {
			return nil, err
		}
	}
	updated := current
	updated.Models, updated.OtherSettings, updated.AutoPriceGuardID = input.NextModels, input.OtherSettings, 0
	updated.ConfigRevision++
	if updated.ConfigRevision < 1 {
		updated.ConfigRevision = 1
	}
	if err := tx.Model(&model.Channel{}).Where("id = ?", updated.Id).Updates(map[string]any{
		"models": updated.Models, "settings": updated.OtherSettings, "auto_price_guard_id": int64(0), "config_revision": updated.ConfigRevision,
	}).Error; err != nil {
		return nil, err
	}
	if err := updated.UpdateAbilities(tx); err != nil {
		return nil, err
	}
	config, err := LoadChannelAutoSyncConfigTx(tx)
	if err != nil {
		return nil, err
	}
	if err := AppendChannelAutoSyncEventsTx(tx, &updated, config, string(input.Trigger), nil, common.GetTimestamp()); err != nil {
		return nil, err
	}
	result.Updated, result.ModelsChanged = &updated, true
	result.EventsAppended = config.PriceEnabled || config.MetadataEnabled
	result.CacheRefreshRequired = true
	return result, nil
}

func UpdateChannelKeyConfiguration(next *model.Channel) (*ChannelKeyConfigurationMutationResult, error) {
	var result *ChannelKeyConfigurationMutationResult
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		result, err = UpdateChannelKeyConfigurationTx(tx, next)
		return err
	})
	return result, err
}

func UpdateChannelKeyConfigurationTx(tx *gorm.DB, next *model.Channel) (*ChannelKeyConfigurationMutationResult, error) {
	if tx == nil || next == nil || next.Id == 0 {
		return nil, errors.New("invalid channel key configuration mutation")
	}
	var current model.Channel
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, "id = ?", next.Id).Error; err != nil {
		return nil, err
	}
	result := &ChannelKeyConfigurationMutationResult{Current: &current, Updated: &current}
	if current.Key == next.Key && reflect.DeepEqual(current.ChannelInfo, next.ChannelInfo) {
		return result, nil
	}
	if current.AutoPriceGuardID != 0 {
		if _, err := model.InvalidateAutoPriceGuardTx(tx, current.AutoPriceGuardID, "administrator multi-key configuration changed"); err != nil {
			return nil, err
		}
	}
	updated := current
	updated.Key = next.Key
	updated.ChannelInfo = next.ChannelInfo
	updated.AutoPriceGuardID = 0
	updated.ConfigRevision++
	if updated.ConfigRevision < 1 {
		updated.ConfigRevision = 1
	}
	if err := tx.Model(&model.Channel{}).Where("id = ?", updated.Id).Updates(map[string]any{
		"key": updated.Key, "channel_info": updated.ChannelInfo, "auto_price_guard_id": int64(0), "config_revision": updated.ConfigRevision,
	}).Error; err != nil {
		return nil, err
	}
	result.Updated, result.Changed, result.CacheRefreshRequired = &updated, true, true
	return result, nil
}

// administratorChannel overlays only fields that an administrator configures.
// In particular it makes omitted runtime fields harmless even if next was
// decoded from a sparse JSON body.
func administratorChannel(current, next model.Channel) model.Channel {
	updated := next
	updated.Id = current.Id
	updated.Status = current.Status
	updated.CreatedTime = current.CreatedTime
	updated.TestTime = current.TestTime
	updated.ResponseTime = current.ResponseTime
	updated.Balance = current.Balance
	updated.BalanceUpdatedTime = current.BalanceUpdatedTime
	updated.UsedQuota = current.UsedQuota
	updated.AutoPriceGuardID = current.AutoPriceGuardID
	updated.ConfigRevision = current.ConfigRevision
	updated.Keys = current.Keys
	updated.ChannelInfo.MultiKeyStatusList = current.ChannelInfo.MultiKeyStatusList
	updated.ChannelInfo.MultiKeyDisabledReason = current.ChannelInfo.MultiKeyDisabledReason
	updated.ChannelInfo.MultiKeyDisabledTime = current.ChannelInfo.MultiKeyDisabledTime
	updated.ChannelInfo.MultiKeyPollingIndex = current.ChannelInfo.MultiKeyPollingIndex
	return updated
}

// updateAdministratorChannelTx retains UpdateTx's multi-key normalization,
// then explicitly writes the complete administrator snapshot. The second step
// is necessary because the legacy helper intentionally uses struct Updates,
// which omits zero values and nil pointers.
func updateAdministratorChannelTx(tx *gorm.DB, channel *model.Channel) error {
	desired := *channel
	if err := channel.UpdateTx(tx); err != nil {
		return err
	}
	// UpdateTx may have pruned stale multi-key runtime entries; retain that
	// cleanup while restoring the desired administrator-owned info fields.
	desired.ChannelInfo.MultiKeyStatusList = channel.ChannelInfo.MultiKeyStatusList
	desired.ChannelInfo.MultiKeyDisabledReason = channel.ChannelInfo.MultiKeyDisabledReason
	desired.ChannelInfo.MultiKeyDisabledTime = channel.ChannelInfo.MultiKeyDisabledTime
	desired.ChannelInfo.MultiKeyPollingIndex = channel.ChannelInfo.MultiKeyPollingIndex
	desired.ChannelInfo.MultiKeySize = channel.ChannelInfo.MultiKeySize
	values := map[string]any{
		"type": desired.Type, "key": desired.Key, "open_ai_organization": desired.OpenAIOrganization, "test_model": desired.TestModel,
		"name": desired.Name, "weight": desired.Weight, "base_url": desired.BaseURL, "other": desired.Other, "models": desired.Models,
		"group": desired.Group, "model_mapping": desired.ModelMapping, "status_code_mapping": desired.StatusCodeMapping,
		"priority": desired.Priority, "auto_ban": desired.AutoBan, "other_info": desired.OtherInfo, "tag": desired.Tag,
		"setting": desired.Setting, "param_override": desired.ParamOverride, "header_override": desired.HeaderOverride, "remark": desired.Remark,
		"channel_info": desired.ChannelInfo, "settings": desired.OtherSettings, "auto_price_guard_id": int64(0), "config_revision": desired.ConfigRevision,
	}
	if err := tx.Model(&model.Channel{}).Where("id = ?", desired.Id).Updates(values).Error; err != nil {
		return err
	}
	if err := tx.First(channel, "id = ?", desired.Id).Error; err != nil {
		return err
	}
	return channel.UpdateAbilities(tx)
}

type channelAdminConfigSnapshot struct {
	Type                                                int
	Key                                                 string
	OpenAIOrganization, TestModel                       *string
	Name                                                string
	Weight                                              *uint
	BaseURL                                             *string
	Other, Models, Group                                string
	ModelMapping, StatusCodeMapping                     *string
	Priority                                            *int64
	AutoBan                                             *int
	OtherInfo                                           string
	Tag, Setting, ParamOverride, HeaderOverride, Remark *string
	OtherSettings                                       string
	IsMultiKey                                          bool
	MultiKeySize                                        int
	MultiKeyMode                                        interface{}
}

func adminConfigSnapshot(c model.Channel) channelAdminConfigSnapshot {
	return channelAdminConfigSnapshot{c.Type, c.Key, c.OpenAIOrganization, c.TestModel, c.Name, c.Weight, c.BaseURL, c.Other, c.Models, c.Group,
		c.ModelMapping, c.StatusCodeMapping, c.Priority, c.AutoBan, c.OtherInfo, c.Tag, c.Setting, c.ParamOverride, c.HeaderOverride, c.Remark,
		c.OtherSettings, c.ChannelInfo.IsMultiKey, c.ChannelInfo.MultiKeySize, c.ChannelInfo.MultiKeyMode}
}
