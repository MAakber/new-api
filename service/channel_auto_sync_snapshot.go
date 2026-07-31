package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

// These persistent option keys are shared with the Phase D configuration API.
const (
	AutoPriceSyncEnabledOptionKey         = "auto_price_sync.enabled"
	AutoPriceSyncSourceOptionKey          = "auto_price_sync.source_descriptor"
	AutoModelMetadataSyncEnabledOptionKey = "auto_model_metadata_sync.enabled"
	AutoPriceSyncEventType                = model.SystemTaskTypeAutoPriceSync
	AutoModelMetadataSyncEventType        = model.SystemTaskTypeAutoModelSync
	maxAutoSyncSnapshotModels             = 1000
	maxAutoSyncSnapshotModelNameBytes     = 256
	maxAutoSyncSnapshotTriggerBytes       = 64
)

type ChannelAutoSyncConfig struct {
	PriceEnabled    bool
	PriceSource     *PricingSourceDescriptor
	MetadataEnabled bool
}

// AutoPriceSyncEventPayload is intentionally secret-free and bounded before
// serialization, because it becomes durable task input.
type AutoPriceSyncEventPayload struct {
	Source  PricingSourceDescriptor `json:"source"`
	GuardID int64                   `json:"guard_id,omitempty"`
	Models  []string                `json:"models"`
}

// AutoModelMetadataSyncEventPayload intentionally carries no channel snapshot:
// the handler resolves current models at run time.
type AutoModelMetadataSyncEventPayload struct{}

func LoadChannelAutoSyncConfigTx(tx *gorm.DB) (ChannelAutoSyncConfig, error) {
	if tx == nil {
		return ChannelAutoSyncConfig{}, errors.New("auto sync transaction is nil")
	}
	values := map[string]string{}
	for _, key := range []string{AutoPriceSyncEnabledOptionKey, AutoPriceSyncSourceOptionKey, AutoModelMetadataSyncEnabledOptionKey} {
		var option model.Option
		err := tx.Where(&model.Option{Key: key}).First(&option).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			continue
		}
		if err != nil {
			return ChannelAutoSyncConfig{}, err
		}
		values[key] = option.Value
	}
	parseEnabled := func(key string) (bool, error) {
		if strings.TrimSpace(values[key]) == "" {
			return false, nil
		}
		value, err := strconv.ParseBool(values[key])
		if err != nil {
			return false, fmt.Errorf("invalid %s", key)
		}
		return value, nil
	}
	priceEnabled, err := parseEnabled(AutoPriceSyncEnabledOptionKey)
	if err != nil {
		return ChannelAutoSyncConfig{}, err
	}
	metadataEnabled, err := parseEnabled(AutoModelMetadataSyncEnabledOptionKey)
	if err != nil {
		return ChannelAutoSyncConfig{}, err
	}
	config := ChannelAutoSyncConfig{PriceEnabled: priceEnabled, MetadataEnabled: metadataEnabled}
	if !priceEnabled {
		return config, nil
	}
	raw := strings.TrimSpace(values[AutoPriceSyncSourceOptionKey])
	if raw == "" {
		return ChannelAutoSyncConfig{}, errors.New("auto price sync source is required when enabled")
	}
	var source PricingSourceDescriptor
	if err := json.Unmarshal([]byte(raw), &source); err != nil {
		return ChannelAutoSyncConfig{}, errors.New("invalid auto price sync source")
	}
	source, err = ValidatePricingSourceDescriptor(source)
	if err != nil {
		return ChannelAutoSyncConfig{}, fmt.Errorf("invalid auto price sync source: %w", err)
	}
	config.PriceSource = &source
	return config, nil
}

// BuildChannelAutoPriceGuardTx snapshots missing base-priced models from the
// transaction's canonical Option rows. ModelMapping is deliberately ignored.
func BuildChannelAutoPriceGuardTx(tx *gorm.DB, channel *model.Channel, config ChannelAutoSyncConfig, now int64) (*model.AutoPriceGuard, error) {
	if tx == nil || channel == nil {
		return nil, errors.New("auto price guard requires transaction and channel")
	}
	if !config.PriceEnabled || config.PriceSource == nil {
		return nil, errors.New("auto price guard requires enabled price source")
	}
	source, err := ValidatePricingSourceDescriptor(*config.PriceSource)
	if err != nil {
		return nil, fmt.Errorf("invalid auto price guard source: %w", err)
	}
	modelPrice, err := loadPricingMapTx(tx, "ModelPrice")
	if err != nil {
		return nil, err
	}
	modelRatio, err := loadPricingMapTx(tx, "ModelRatio")
	if err != nil {
		return nil, err
	}
	missing := missingBaseModels(normalizedChannelModels(channel), modelPrice, modelRatio)
	if err := validateSnapshotModels(missing); err != nil {
		return nil, err
	}
	missingJSON, _ := json.Marshal(missing)
	sourceJSON, _ := json.Marshal(source)
	guard := &model.AutoPriceGuard{ChannelID: channel.Id, State: model.AutoPriceGuardStatePending, InitialRevision: channel.ConfigRevision, InitialMissingModels: string(missingJSON), InitialUsedQuota: channel.UsedQuota, Source: string(sourceJSON), CreatedAt: now, UpdatedAt: now}
	if err := tx.Create(guard).Error; err != nil {
		return nil, err
	}
	channel.AutoPriceGuardID = guard.ID
	return guard, nil
}

func AppendChannelAutoSyncEventsTx(tx *gorm.DB, channel *model.Channel, config ChannelAutoSyncConfig, trigger string, guard *model.AutoPriceGuard, now int64) error {
	if tx == nil || channel == nil {
		return errors.New("auto sync events require transaction and channel")
	}
	if len(trigger) == 0 || len(trigger) > maxAutoSyncSnapshotTriggerBytes {
		return errors.New("invalid auto sync trigger")
	}
	if config.PriceEnabled {
		if config.PriceSource == nil {
			return errors.New("enabled price sync requires source")
		}
		source, err := ValidatePricingSourceDescriptor(*config.PriceSource)
		if err != nil {
			return fmt.Errorf("invalid auto price event source: %w", err)
		}
		models := normalizedChannelModels(channel)
		if err := validateSnapshotModels(models); err != nil {
			return err
		}
		if guard != nil {
			if guard.ChannelID != channel.Id {
				return errors.New("auto price guard channel mismatch")
			}
			var guardSource PricingSourceDescriptor
			if err := json.Unmarshal([]byte(guard.Source), &guardSource); err != nil {
				return errors.New("invalid auto price guard source")
			}
			guardSource, err = ValidatePricingSourceDescriptor(guardSource)
			if err != nil || !samePricingSource(source, guardSource) {
				return errors.New("auto price guard source mismatch")
			}
			var initialMissing []string
			if err := json.Unmarshal([]byte(guard.InitialMissingModels), &initialMissing); err != nil || validateSnapshotModels(initialMissing) != nil {
				return errors.New("invalid auto price guard snapshot")
			}
		}
		guardID := int64(0)
		if guard != nil {
			guardID = guard.ID
		}
		payload, _ := json.Marshal(AutoPriceSyncEventPayload{Source: source, GuardID: guardID, Models: models})
		if err := model.AppendAutoSyncEventTx(tx, &model.AutoSyncEvent{Type: AutoPriceSyncEventType, ChannelID: channel.Id, Trigger: trigger, Payload: string(payload), EventAt: now, CreatedAt: now}); err != nil {
			return err
		}
	}
	if config.MetadataEnabled {
		payload, _ := json.Marshal(AutoModelMetadataSyncEventPayload{})
		if err := model.AppendAutoSyncEventTx(tx, &model.AutoSyncEvent{Type: AutoModelMetadataSyncEventType, ChannelID: channel.Id, Trigger: trigger, Payload: string(payload), EventAt: now, CreatedAt: now}); err != nil {
			return err
		}
	}
	return nil
}

func loadPricingMapTx(tx *gorm.DB, key string) (map[string]json.RawMessage, error) {
	var option model.Option
	if err := tx.Where(&model.Option{Key: key}).First(&option).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: %s", model.ErrPricingOptionIntegrity, key)
		}
		return nil, err
	}
	var values map[string]json.RawMessage
	if err := json.Unmarshal([]byte(option.Value), &values); err != nil || values == nil {
		return nil, fmt.Errorf("%w: invalid %s JSON", model.ErrPricingOptionIntegrity, key)
	}
	return values, nil
}

func missingBaseModels(models []string, prices, ratios map[string]json.RawMessage) []string {
	missing := make([]string, 0, len(models))
	for _, name := range models {
		if _, hasPrice := prices[name]; !hasPrice {
			if _, hasRatio := ratios[name]; !hasRatio {
				missing = append(missing, name)
			}
		}
	}
	return missing
}

func normalizedChannelModels(channel *model.Channel) []string {
	set := map[string]struct{}{}
	for _, name := range channel.GetModels() {
		name = strings.TrimSpace(ratio_setting.FormatMatchingModelName(name))
		if name != "" {
			set[name] = struct{}{}
		}
	}
	models := make([]string, 0, len(set))
	for name := range set {
		models = append(models, name)
	}
	sort.Strings(models)
	return models
}

func samePricingSource(left, right PricingSourceDescriptor) bool {
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return string(leftJSON) == string(rightJSON)
}

func validateSnapshotModels(models []string) error {
	if len(models) > maxAutoSyncSnapshotModels {
		return errors.New("auto sync model snapshot exceeds limit")
	}
	for _, name := range models {
		if name == "" || len(name) > maxAutoSyncSnapshotModelNameBytes {
			return errors.New("invalid auto sync model snapshot")
		}
	}
	return nil
}
