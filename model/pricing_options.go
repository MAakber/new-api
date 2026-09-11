package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// PricingOptionKeys is the complete, ordered set of option rows owned by the
// pricing patch service. Keep this order stable: it is also the lock/read order.
var PricingOptionKeys = []string{
	"ModelPrice", "ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio",
	"ImageRatio", "AudioRatio", "AudioCompletionRatio",
	"billing_setting.billing_mode", "billing_setting.billing_expr",
}

var (
	ErrPricingOptionRequiresPatch = errors.New("pricing options must be updated through the pricing patch service")
	ErrPricingOptionIntegrity     = errors.New("pricing option integrity error: canonical option row is missing or duplicated")
	ErrPricingOptionConflict      = errors.New("pricing patch conflict")
	pricingOptionMutationMutex    sync.Mutex
	pricingOptionPublishMutex     sync.Mutex
)

// MutatePricingOptions is the sole pricing writer. Both expected-value patches
// and versioned model edits lock the same canonical rows in the same order.
// A caller may include metadata/channel changes in this transaction; no runtime
// prices are published unless every database write commits.
func MutatePricingOptions(mutate func(*gorm.DB, map[string]map[string]json.RawMessage) error) (map[string]string, error) {
	pricingOptionMutationMutex.Lock()
	defer pricingOptionMutationMutex.Unlock()
	err := DB.Transaction(func(tx *gorm.DB) error {
		maps := make(map[string]map[string]json.RawMessage, len(PricingOptionKeys))
		original := make(map[string]string, len(PricingOptionKeys))
		for _, key := range PricingOptionKeys {
			var rows []Option
			if err := lockForUpdate(tx).Where(&Option{Key: key}).Limit(2).Find(&rows).Error; err != nil {
				return err
			}
			if len(rows) != 1 {
				return fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, key)
			}
			option := rows[0]
			var values map[string]json.RawMessage
			if err := common.UnmarshalJsonStr(option.Value, &values); err != nil || values == nil {
				return fmt.Errorf("pricing option %q is not a JSON object", key)
			}
			maps[key], original[key] = values, option.Value
		}
		if err := mutate(tx, maps); err != nil {
			return err
		}
		for _, key := range PricingOptionKeys {
			encoded, err := common.Marshal(maps[key])
			if err != nil {
				return err
			}
			value, err := normalizeOptionValue(key, string(encoded))
			if err != nil {
				return err
			}
			if value == original[key] {
				continue
			}
			updated := tx.Model(&Option{}).Where(&Option{Key: key}).Where("value = ?", original[key]).Update("value", value)
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != 1 {
				return ErrPricingOptionConflict
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	values, err := RefreshPricingOptionMapsFromDatabase()
	if err != nil {
		return nil, err
	}
	RefreshPricing()
	ratio_setting.InvalidateExposedDataCache()
	return values, nil
}

func IsPricingOptionKey(key string) bool {
	for _, pricingKey := range PricingOptionKeys {
		if key == pricingKey {
			return true
		}
	}
	return false
}

// CanonicalPricingOptionDefaults must be called after InitRatioSettings and
// before InitOptionMap loads persisted options over the in-memory defaults.
func CanonicalPricingOptionDefaults() map[string]string {
	configs := config.GlobalConfig.ExportAllConfigs()
	defaults := map[string]string{
		"ModelPrice":                   ratio_setting.ModelPrice2JSONString(),
		"ModelRatio":                   ratio_setting.ModelRatio2JSONString(),
		"CompletionRatio":              ratio_setting.CompletionRatio2JSONString(),
		"CacheRatio":                   ratio_setting.CacheRatio2JSONString(),
		"CreateCacheRatio":             ratio_setting.CreateCacheRatio2JSONString(),
		"ImageRatio":                   ratio_setting.ImageRatio2JSONString(),
		"AudioRatio":                   ratio_setting.AudioRatio2JSONString(),
		"AudioCompletionRatio":         ratio_setting.AudioCompletionRatio2JSONString(),
		"billing_setting.billing_mode": "{}",
		"billing_setting.billing_expr": "{}",
	}
	for _, key := range []string{"billing_setting.billing_mode", "billing_setting.billing_expr"} {
		if value, ok := configs[key]; ok {
			defaults[key] = value
		}
	}
	return defaults
}

// SeedCanonicalPricingOptions creates only missing canonical rows. Existing
// administrator values are deliberately never read-modified-written here.
func SeedCanonicalPricingOptions() error {
	unique, err := optionsKeyIsUnique(DB)
	if err != nil {
		return err
	}
	if !unique {
		return fmt.Errorf("%w: repair options uniqueness before seeding", ErrPricingOptionIntegrity)
	}
	defaults := CanonicalPricingOptionDefaults()
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, key := range PricingOptionKeys {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: defaults[key]}).Error; err != nil {
				return fmt.Errorf("seed pricing option %q: %w", key, err)
			}
		}
		_, err := readModelPricingMaps(tx)
		return err
	})
}

// ApplyPricingOptionMaps publishes committed pricing values through the same
// validation/runtime update path as regular options. It is intentionally only
// exposed for the pricing service after a successful database commit.
func ApplyPricingOptionMaps(values map[string]string) error {
	pricingOptionPublishMutex.Lock()
	defer pricingOptionPublishMutex.Unlock()
	return applyPricingOptionMaps(values)
}

// RefreshPricingOptionMapsFromDatabase publishes one complete, current pricing
// snapshot only after its transaction has committed. It deliberately rereads
// rather than publishing the caller's stale transaction snapshot.
func RefreshPricingOptionMapsFromDatabase() (map[string]string, error) {
	pricingOptionPublishMutex.Lock()
	defer pricingOptionPublishMutex.Unlock()
	values := make(map[string]string, len(PricingOptionKeys))
	var rows []Option
	if err := DB.Where(map[string]any{"key": PricingOptionKeys}).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, option := range rows {
		if _, exists := values[option.Key]; exists {
			return nil, fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, option.Key)
		}
		var object map[string]json.RawMessage
		if err := common.UnmarshalJsonStr(option.Value, &object); err != nil || object == nil {
			return nil, fmt.Errorf("pricing option %q is not a JSON object", option.Key)
		}
		values[option.Key] = option.Value
	}
	if err := applyPricingOptionMaps(values); err != nil {
		return nil, err
	}
	return values, nil
}

func applyPricingOptionMaps(values map[string]string) error {
	for _, key := range PricingOptionKeys {
		value, ok := values[key]
		if !ok {
			return fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, key)
		}
		if _, err := normalizeOptionValue(key, value); err != nil {
			return err
		}
	}
	for _, key := range PricingOptionKeys {
		if err := updateOptionMap(key, values[key]); err != nil {
			return err
		}
	}
	return nil
}
