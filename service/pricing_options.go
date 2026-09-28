package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	stdmaps "maps"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"gorm.io/gorm"
)

var (
	ErrPricingPatchConflict   = model.ErrPricingOptionConflict
	ErrPricingPatchValidation = errors.New("invalid pricing patch")
)

const (
	PricingPatchSet          = "set"
	PricingPatchDelete       = "delete"
	PricingPatchSetIfMissing = "set_if_missing"
)

type PricingExpectedValue struct {
	Present bool            `json:"present"`
	Value   json.RawMessage `json:"value,omitempty"`
}

type PricingPatchOperation struct {
	Key      string                `json:"key"`
	Model    string                `json:"model"`
	Action   string                `json:"action"`
	Value    json.RawMessage       `json:"value,omitempty"`
	Expected *PricingExpectedValue `json:"expected,omitempty"`
}

// PatchPricingOptions atomically applies model-level changes to the
// canonical JSON maps. Returned values are the complete committed maps.
func PatchPricingOptions(operations []PricingPatchOperation) (map[string]string, error) {
	committed, _, err := PatchPricingOptionsWithApplied(operations)
	return committed, err
}

// PatchPricingOptionsWithApplied is the task-facing variant. Applied is the
// number of operations that changed a value inside the committed transaction.
func PatchPricingOptionsWithApplied(operations []PricingPatchOperation) (map[string]string, int, error) {
	if len(operations) == 0 {
		return nil, 0, fmt.Errorf("pricing patch is empty")
	}
	if err := validatePricingOperations(operations); err != nil {
		return nil, 0, err
	}
	applied := 0
	latest, err := model.MutatePricingOptions(func(_ *gorm.DB, maps map[string]map[string]json.RawMessage) error {
		previous := make(map[string]map[string]json.RawMessage, len(maps))
		for key, values := range maps {
			previous[key] = stdmaps.Clone(values)
		}
		for _, operation := range operations {
			if operation.Expected == nil {
				continue
			}
			actual, present := maps[operation.Key][operation.Model]
			if present != operation.Expected.Present || (present && !jsonEqual(actual, operation.Expected.Value)) {
				return ErrPricingPatchConflict
			}
		}
		for _, operation := range operations {
			values := maps[operation.Key]
			current, present := values[operation.Model]
			switch operation.Action {
			case PricingPatchSet:
				if !present || !jsonEqual(current, operation.Value) {
					applied++
				}
				values[operation.Model] = append(json.RawMessage(nil), operation.Value...)
			case PricingPatchDelete:
				if present {
					applied++
				}
				delete(values, operation.Model)
			case PricingPatchSetIfMissing:
				if !present {
					applied++
					values[operation.Model] = append(json.RawMessage(nil), operation.Value...)
				}
			}
		}
		changedModels := make(map[string]bool)
		for _, operation := range operations {
			name := operation.Model
			if operation.Key == billing_setting.PluginBillingExprOption {
				_, name, _ = billing_setting.SplitPluginBillingExprKey(name)
			}
			changedModels[name] = true
		}
		for name := range changedModels {
			var snapshots [2]model.PricingValues
			for index, options := range []map[string]map[string]json.RawMessage{maps, previous} {
				pricing := make(model.PricingValues)
				for _, key := range model.PricingOptionKeys {
					if key == billing_setting.PluginBillingExprOption {
						variants := make(map[string]any)
						for composite, raw := range options[key] {
							pluginKey, modelName, valid := billing_setting.SplitPluginBillingExprKey(composite)
							if !valid || modelName != name {
								continue
							}
							var expression string
							if err := common.Unmarshal(raw, &expression); err != nil {
								return fmt.Errorf("%w: %s", ErrPricingPatchValidation, err)
							}
							variants[pluginKey] = expression
						}
						if len(variants) > 0 {
							pricing[key] = variants
						}
						continue
					}
					if raw, exists := options[key][name]; exists {
						var value any
						if err := common.Unmarshal(raw, &value); err != nil {
							return fmt.Errorf("%w: %s", ErrPricingPatchValidation, err)
						}
						pricing[key] = value
					}
				}
				snapshots[index] = pricing
			}
			if err := model.ValidateModelPricingAgainstSnapshot(name, snapshots[0], snapshots[1]); err != nil {
				return fmt.Errorf("%w: %s", ErrPricingPatchValidation, err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	return latest, applied, nil
}

// ResetModelRatio restores the ModelRatio map to the supplied built-in default.
// It translates the reset into expected-value patch operations so it has the
// same CAS and all-or-nothing semantics as a normal manual patch.
func ResetModelRatio(defaultJSON string) (map[string]string, error) {
	var option model.Option
	if err := model.DB.Where(&model.Option{Key: "ModelRatio"}).First(&option).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("%w: ModelRatio", model.ErrPricingOptionIntegrity)
		}
		return nil, err
	}
	var current, defaults map[string]json.RawMessage
	if err := common.Unmarshal([]byte(option.Value), &current); err != nil || current == nil {
		return nil, fmt.Errorf("pricing option %q is not a JSON object", "ModelRatio")
	}
	if err := common.Unmarshal([]byte(defaultJSON), &defaults); err != nil || defaults == nil {
		return nil, fmt.Errorf("default ModelRatio is not a JSON object")
	}
	models := make(map[string]struct{}, len(current)+len(defaults))
	for name := range current {
		models[name] = struct{}{}
	}
	for name := range defaults {
		models[name] = struct{}{}
	}
	names := make([]string, 0, len(models))
	for name := range models {
		names = append(names, name)
	}
	sort.Strings(names)
	operations := make([]PricingPatchOperation, 0, len(names))
	for _, name := range names {
		oldValue, oldPresent := current[name]
		defaultValue, defaultPresent := defaults[name]
		if oldPresent == defaultPresent && (!oldPresent || jsonEqual(oldValue, defaultValue)) {
			continue
		}
		expected := &PricingExpectedValue{Present: oldPresent, Value: oldValue}
		if defaultPresent {
			operations = append(operations, PricingPatchOperation{Key: "ModelRatio", Model: name, Action: PricingPatchSet, Value: defaultValue, Expected: expected})
		} else {
			operations = append(operations, PricingPatchOperation{Key: "ModelRatio", Model: name, Action: PricingPatchDelete, Expected: expected})
		}
	}
	if len(operations) == 0 {
		// Patch requires a non-empty operation list; return a consistent current
		// snapshot for an already-reset map.
		return readCanonicalPricingOptions()
	}
	return PatchPricingOptions(operations)
}

func readCanonicalPricingOptions() (map[string]string, error) {
	result := make(map[string]string, len(model.PricingOptionKeys))
	for _, key := range model.PricingOptionKeys {
		var option model.Option
		if err := model.DB.Where(&model.Option{Key: key}).First(&option).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("%w: %s", model.ErrPricingOptionIntegrity, key)
			}
			return nil, err
		}
		result[key] = option.Value
	}
	return result, nil
}

func validatePricingOperations(operations []PricingPatchOperation) error {
	for _, operation := range operations {
		if !model.IsPricingOptionKey(operation.Key) || operation.Model == "" {
			return fmt.Errorf("%w: invalid target", ErrPricingPatchValidation)
		}
		if operation.Key == billing_setting.PluginBillingExprOption {
			if _, _, valid := billing_setting.SplitPluginBillingExprKey(operation.Model); !valid {
				return fmt.Errorf("%w: invalid plugin pricing target", ErrPricingPatchValidation)
			}
		}
		switch operation.Action {
		case PricingPatchSet, PricingPatchDelete:
			if operation.Expected == nil {
				return fmt.Errorf("%w: %s requires expected value", ErrPricingPatchValidation, operation.Action)
			}
		case PricingPatchSetIfMissing:
			if operation.Expected != nil {
				return fmt.Errorf("%w: set_if_missing does not accept expected value", ErrPricingPatchValidation)
			}
		default:
			return fmt.Errorf("%w: invalid action", ErrPricingPatchValidation)
		}
		if operation.Action != PricingPatchDelete {
			if !isPricingScalar(operation.Key, operation.Value) {
				return fmt.Errorf("%w: value must be a JSON scalar", ErrPricingPatchValidation)
			}
		}
		if operation.Expected != nil && operation.Expected.Present && !isPricingScalar(operation.Key, operation.Expected.Value) {
			return fmt.Errorf("%w: expected value must be a JSON scalar", ErrPricingPatchValidation)
		}
	}
	return nil
}

func isPricingScalar(key string, raw json.RawMessage) bool {
	var value any
	if len(raw) == 0 || common.Unmarshal(raw, &value) != nil || value == nil {
		return false
	}
	if key == "billing_setting.billing_mode" || key == "billing_setting.billing_expr" || key == billing_setting.PluginBillingExprOption {
		_, ok := value.(string)
		return ok
	}
	_, ok := value.(float64)
	return ok
}

func jsonEqual(left, right json.RawMessage) bool {
	var a, b any
	return common.Unmarshal(left, &a) == nil && common.Unmarshal(right, &b) == nil && bytes.Equal(mustJSON(a), mustJSON(b))
}

func mustJSON(value any) []byte {
	encoded, _ := common.Marshal(value)
	return encoded
}
