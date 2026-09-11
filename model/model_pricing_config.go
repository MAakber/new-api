package model

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

// PricingValues is one model's configuration, keyed by the existing option
// names. A missing key inherits the engine's default; an explicit zero is free.
type PricingValues map[string]any

type ModelPricingChange struct {
	ModelName       string        `json:"model_name"`
	ExpectedVersion string        `json:"expected_version"`
	Pricing         PricingValues `json:"pricing"`
	Reset           bool          `json:"reset,omitempty"`
}

type ModelPricingEntry struct {
	ModelName   string                               `json:"model_name"`
	Version     string                               `json:"version"`
	Configured  PricingValues                        `json:"configured"`
	Effective   PricingValues                        `json:"effective"`
	UsageSchema map[string]jsplugin.UsageFieldSchema `json:"usage_schema,omitempty"`
}

type ModelPricingSnapshot struct {
	Entries      []ModelPricingEntry `json:"entries"`
	Options      map[string]string   `json:"options"`
	EmptyVersion string              `json:"empty_version"`
}

var ErrModelPricingConflict = errors.New("model pricing changed; reload before saving")

func ModelPricingVersion(values PricingValues) string {
	encoded, _ := common.Marshal(values)
	return fmt.Sprintf("%x", sha256.Sum256(encoded))
}

func defaultPricingMaps() map[string]map[string]any {
	result := make(map[string]map[string]any, len(PricingOptionKeys))
	for _, key := range PricingOptionKeys {
		result[key] = make(map[string]any)
	}
	for key, values := range ratio_setting.GetDefaultPricingMaps() {
		for name, value := range values {
			result[key][name] = value
		}
	}
	return result
}

func readModelPricingMaps(db *gorm.DB) (map[string]map[string]any, error) {
	var rows []Option
	if err := db.Where(map[string]any{"key": PricingOptionKeys}).Find(&rows).Error; err != nil {
		return nil, err
	}
	values := make(map[string]map[string]any, len(PricingOptionKeys))
	for _, row := range rows {
		if _, exists := values[row.Key]; exists {
			return nil, fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, row.Key)
		}
		var entries map[string]any
		if err := common.UnmarshalJsonStr(row.Value, &entries); err != nil {
			return nil, fmt.Errorf("%s: %w", row.Key, err)
		}
		if entries == nil {
			return nil, fmt.Errorf("%s must be a JSON object", row.Key)
		}
		values[row.Key] = entries
	}
	for _, key := range PricingOptionKeys {
		if _, exists := values[key]; !exists {
			return nil, fmt.Errorf("%w: %s", ErrPricingOptionIntegrity, key)
		}
	}
	return values, nil
}

func modelPricingValues(values map[string]map[string]any, name string) PricingValues {
	result := make(PricingValues)
	for _, key := range PricingOptionKeys {
		if value, exists := values[key][name]; exists {
			result[key] = value
		}
	}
	return result
}

func effectiveModelPricing(values map[string]map[string]any, name string) PricingValues {
	result := modelPricingValues(values, name)
	// Legacy wildcard aliases are resolved by the same normalization as relay.
	alias := ratio_setting.FormatMatchingModelName(name)
	for _, key := range PricingOptionKeys[:8] {
		if value, exists := values[key][alias]; exists {
			result[key] = value
		}
	}
	mode, _ := result["billing_setting.billing_mode"].(string)
	if mode == "" {
		_, hasPrice := result["ModelPrice"]
		_, hasRatio := result["ModelRatio"]
		if _, builtin := billing_setting.GetBuiltinBillingExpr(name); builtin && !hasPrice && !hasRatio {
			mode = "tiered_expr"
		}
	}
	if mode == "tiered_expr" {
		result["billing_setting.billing_mode"] = mode
		if _, exists := result["billing_setting.billing_expr"]; !exists {
			if expression, ok := billing_setting.GetBuiltinBillingExpr(name); ok {
				result["billing_setting.billing_expr"] = expression
			}
		}
		return result
	}
	if _, exists := result["ModelPrice"]; exists {
		return result
	}
	if _, exists := result["ModelRatio"]; !exists && operation_setting.SelfUseModeEnabled {
		result["ModelRatio"] = float64(37.5)
	}
	// Completion ratios include engine-enforced model defaults. Expose their
	// effective value without persisting them into the editable configuration.
	completion := ratio_setting.GetCompletionRatioInfo(name)
	if _, exists := result["CompletionRatio"]; !exists || completion.Locked {
		result["CompletionRatio"] = completion.Ratio
	}
	return result
}

func GetModelPricingSnapshot(names []string) (*ModelPricingSnapshot, error) {
	values, err := readModelPricingMaps(DB)
	if err != nil {
		return nil, err
	}
	if len(names) == 0 {
		nameSet := make(map[string]bool)
		for _, entries := range values {
			for name := range entries {
				nameSet[name] = true
			}
		}
		for name := range billing_setting.GetBuiltinBillingExprCopy() {
			nameSet[name] = true
		}
		for name := range nameSet {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	result := &ModelPricingSnapshot{Entries: make([]ModelPricingEntry, 0, len(names)), Options: make(map[string]string), EmptyVersion: ModelPricingVersion(PricingValues{})}
	generation := jsplugin.DefaultRegistry.Generation()
	for _, name := range names {
		configured := modelPricingValues(values, name)
		entry := ModelPricingEntry{ModelName: name, Version: ModelPricingVersion(configured), Configured: configured, Effective: effectiveModelPricing(values, name)}
		plugin, found := generation.GetByModel(name)
		if !found {
			if target, resolved := ResolveTaskModelAlias(generation, name); resolved {
				plugin, found = generation.Get(target.PluginKey)
			}
		}
		if found {
			entry.UsageSchema = plugin.Meta.UsageSchema
		}
		result.Entries = append(result.Entries, entry)
	}
	// Preserve the existing settings editor's full-map interface. Built-in
	// expressions are display defaults only; per-model writes do not persist them.
	for name, expression := range billing_setting.GetBuiltinBillingExprCopy() {
		effective := effectiveModelPricing(values, name)
		if effective["billing_setting.billing_mode"] != "tiered_expr" {
			continue
		}
		if _, ok := values["billing_setting.billing_mode"][name]; !ok {
			values["billing_setting.billing_mode"][name] = "tiered_expr"
		}
		if _, ok := values["billing_setting.billing_expr"][name]; !ok {
			values["billing_setting.billing_expr"][name] = expression
		}
	}
	for key, entries := range values {
		encoded, err := common.Marshal(entries)
		if err != nil {
			return nil, err
		}
		result.Options[key] = string(encoded)
	}
	return result, nil
}

func ValidateModelPricing(name string, values PricingValues) error {
	if strings.TrimSpace(name) == "" {
		return errors.New("model name is required")
	}
	for key, value := range values {
		if !IsPricingOptionKey(key) {
			return fmt.Errorf("unsupported pricing field: %s", key)
		}
		if key == "billing_setting.billing_mode" {
			if value != "ratio" && value != "tiered_expr" {
				return errors.New("invalid billing mode")
			}
			continue
		}
		if key == "billing_setting.billing_expr" {
			expression, ok := value.(string)
			if !ok || strings.TrimSpace(expression) == "" {
				return errors.New("billing expression is required")
			}
			var err error
			generation := jsplugin.DefaultRegistry.Generation()
			plugin, found := generation.GetByModel(name)
			if !found {
				if target, resolved := ResolveTaskModelAlias(generation, name); resolved {
					plugin, found = generation.Get(target.PluginKey)
				}
			}
			if found {
				err = billing_setting.SmokeTestTaskExpr(expression, plugin.Meta.UsageSchema)
			} else {
				err = billing_setting.SmokeTestExpr(expression)
			}
			if err != nil {
				return fmt.Errorf("model %s: %w", name, err)
			}
			continue
		}
		number, ok := value.(float64)
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) || number < 0 {
			return fmt.Errorf("%s must be a finite, non-negative number", key)
		}
	}
	if values["billing_setting.billing_mode"] == "tiered_expr" {
		if _, exists := values["billing_setting.billing_expr"]; !exists {
			if _, builtin := billing_setting.GetBuiltinBillingExpr(name); !builtin {
				return errors.New("billing expression is required")
			}
		}
	}
	return nil
}

func UpdateModelPricing(changes []ModelPricingChange) error {
	if len(changes) == 0 {
		return errors.New("select model pricing changes before saving")
	}
	seen := make(map[string]bool)
	for _, change := range changes {
		if seen[change.ModelName] {
			return errors.New("duplicate model pricing change")
		}
		seen[change.ModelName] = true
		if change.ExpectedVersion == "" {
			return ErrModelPricingConflict
		}
		if err := ValidateModelPricing(change.ModelName, change.Pricing); err != nil {
			return err
		}
	}
	return mutateModelPricingOptions(func(_ *gorm.DB, values map[string]map[string]any) error {
		defaults := defaultPricingMaps()
		for _, change := range changes {
			if ModelPricingVersion(modelPricingValues(values, change.ModelName)) != change.ExpectedVersion {
				return fmt.Errorf("%w: %s", ErrModelPricingConflict, change.ModelName)
			}
			pricing := change.Pricing
			if change.Reset {
				pricing = modelPricingValues(defaults, change.ModelName)
			}
			for _, key := range PricingOptionKeys {
				delete(values[key], change.ModelName)
				if value, exists := pricing[key]; exists {
					values[key][change.ModelName] = value
				}
			}
		}
		return nil
	})
}

// Model-level operations share the canonical writer with downstream CAS patches.
func mutateModelPricingOptions(mutate func(*gorm.DB, map[string]map[string]any) error) error {
	_, err := MutatePricingOptions(func(tx *gorm.DB, raw map[string]map[string]json.RawMessage) error {
		values := make(map[string]map[string]any, len(PricingOptionKeys))
		for _, key := range PricingOptionKeys {
			values[key] = make(map[string]any, len(raw[key]))
			for name, encoded := range raw[key] {
				var value any
				if err := common.Unmarshal(encoded, &value); err != nil {
					return err
				}
				values[key][name] = value
			}
		}
		if err := mutate(tx, values); err != nil {
			return err
		}
		for _, key := range PricingOptionKeys {
			raw[key] = make(map[string]json.RawMessage, len(values[key]))
			for name, value := range values[key] {
				encoded, err := common.Marshal(value)
				if err != nil {
					return err
				}
				raw[key][name] = encoded
			}
		}
		return nil
	})
	if errors.Is(err, ErrPricingOptionConflict) {
		return ErrModelPricingConflict
	}
	return err
}
