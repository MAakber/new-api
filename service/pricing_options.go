package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

var (
	ErrPricingPatchConflict   = errors.New("pricing patch conflict")
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

// PatchPricingOptions atomically applies model-level changes to the ten
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
	var committed map[string]string
	applied := 0
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		maps := make(map[string]map[string]json.RawMessage, len(model.PricingOptionKeys))
		original := make(map[string]string, len(model.PricingOptionKeys))
		for _, key := range model.PricingOptionKeys {
			var option model.Option
			if err := tx.Where(&model.Option{Key: key}).First(&option).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return fmt.Errorf("%w: %s", model.ErrPricingOptionIntegrity, key)
				}
				return err
			}
			var values map[string]json.RawMessage
			if err := json.Unmarshal([]byte(option.Value), &values); err != nil || values == nil {
				return fmt.Errorf("pricing option %q is not a JSON object", key)
			}
			maps[key], original[key] = values, option.Value
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
		committed = make(map[string]string, len(model.PricingOptionKeys))
		for _, key := range model.PricingOptionKeys {
			encoded, err := json.Marshal(maps[key])
			if err != nil {
				return err
			}
			committed[key] = string(encoded)
			if committed[key] == original[key] {
				continue
			}
			result := tx.Model(&model.Option{}).
				Where(&model.Option{Key: key}).
				Where("value = ?", original[key]).
				Update("value", committed[key])
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected != 1 {
				return ErrPricingPatchConflict
			}
		}
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	latest, err := model.RefreshPricingOptionMapsFromDatabase()
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
	if err := json.Unmarshal([]byte(option.Value), &current); err != nil || current == nil {
		return nil, fmt.Errorf("pricing option %q is not a JSON object", "ModelRatio")
	}
	if err := json.Unmarshal([]byte(defaultJSON), &defaults); err != nil || defaults == nil {
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
	if len(raw) == 0 || json.Unmarshal(raw, &value) != nil || value == nil {
		return false
	}
	if key == "billing_setting.billing_mode" || key == "billing_setting.billing_expr" {
		_, ok := value.(string)
		return ok
	}
	_, ok := value.(float64)
	return ok
}

func jsonEqual(left, right json.RawMessage) bool {
	var a, b any
	return json.Unmarshal(left, &a) == nil && json.Unmarshal(right, &b) == nil && bytes.Equal(mustJSON(a), mustJSON(b))
}

func mustJSON(value any) []byte {
	encoded, _ := json.Marshal(value)
	return encoded
}
