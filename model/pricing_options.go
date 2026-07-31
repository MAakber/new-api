package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"sync"

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
	ErrPricingOptionIntegrity     = errors.New("pricing option integrity error: canonical option row is missing")
	pricingOptionPublishMutex     sync.Mutex
)

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
	defaults := CanonicalPricingOptionDefaults()
	return DB.Transaction(func(tx *gorm.DB) error {
		for _, key := range PricingOptionKeys {
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: key, Value: defaults[key]}).Error; err != nil {
				return fmt.Errorf("seed pricing option %q: %w", key, err)
			}
		}
		return nil
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
	for _, key := range PricingOptionKeys {
		var option Option
		if err := DB.Where(&Option{Key: key}).First(&option).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, key)
			}
			return nil, err
		}
		var object map[string]json.RawMessage
		if err := json.Unmarshal([]byte(option.Value), &object); err != nil || object == nil {
			return nil, fmt.Errorf("pricing option %q is not a JSON object", key)
		}
		values[key] = option.Value
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
