package service

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

type AutoSyncTaskProjection struct {
	TaskID    string                 `json:"task_id"`
	Status    model.SystemTaskStatus `json:"status"`
	Result    any                    `json:"result,omitempty"`
	Error     string                 `json:"error,omitempty"`
	CreatedAt int64                  `json:"created_at"`
	UpdatedAt int64                  `json:"updated_at"`
}

type AutoSyncStatus struct {
	PendingEvents int64                   `json:"pending_events"`
	DueAt         int64                   `json:"due_at"`
	Running       *AutoSyncTaskProjection `json:"running,omitempty"`
	Latest        *AutoSyncTaskProjection `json:"latest,omitempty"`
}

type AutoPriceSyncConfigView struct {
	Enabled bool                     `json:"enabled"`
	Source  *PricingSourceDescriptor `json:"source,omitempty"`
}

type AutoPriceSyncStatusView struct {
	Config AutoPriceSyncConfigView `json:"config"`
	Status AutoSyncStatus          `json:"status"`
}

type AutoModelSyncStatusView struct {
	Enabled bool           `json:"enabled"`
	Status  AutoSyncStatus `json:"status"`
}

func GetAutoPriceSyncStatus() (AutoPriceSyncStatusView, error) {
	config, err := readAutoPriceSyncConfig()
	if err != nil {
		return AutoPriceSyncStatusView{}, err
	}
	status, err := readAutoSyncStatus(AutoPriceSyncEventType)
	return AutoPriceSyncStatusView{Config: config, Status: status}, err
}

func GetAutoModelSyncStatus() (AutoModelSyncStatusView, error) {
	enabled, err := readBoolOption(AutoModelMetadataSyncEnabledOptionKey)
	if err != nil {
		return AutoModelSyncStatusView{}, err
	}
	status, err := readAutoSyncStatus(AutoModelMetadataSyncEventType)
	return AutoModelSyncStatusView{Enabled: enabled, Status: status}, err
}

func UpdateAutoPriceSyncConfig(enabled bool, source *PricingSourceDescriptor) error {
	if source == nil && enabled {
		current, err := readAutoPriceSyncConfig()
		if err != nil {
			return err
		}
		source = current.Source
	}
	values := map[string]string{AutoPriceSyncEnabledOptionKey: strconv.FormatBool(enabled)}
	if source != nil {
		validated, err := ValidatePricingSourceDescriptor(*source)
		if err != nil {
			return err
		}
		encoded, err := json.Marshal(validated)
		if err != nil {
			return err
		}
		values[AutoPriceSyncSourceOptionKey] = string(encoded)
	}
	if enabled && source == nil {
		return errors.New("auto price sync source is required")
	}
	return model.UpdateOptionsBulk(values)
}

func UpdateAutoModelSyncConfig(enabled bool) error {
	return model.UpdateOptionsBulk(map[string]string{AutoModelMetadataSyncEnabledOptionKey: strconv.FormatBool(enabled)})
}

func readAutoPriceSyncConfig() (AutoPriceSyncConfigView, error) {
	enabled, err := readBoolOption(AutoPriceSyncEnabledOptionKey)
	if err != nil {
		return AutoPriceSyncConfigView{}, err
	}
	raw, _, err := readOption(AutoPriceSyncSourceOptionKey)
	if err != nil {
		return AutoPriceSyncConfigView{}, err
	}
	view := AutoPriceSyncConfigView{Enabled: enabled}
	if strings.TrimSpace(raw) == "" {
		return view, nil
	}
	var source PricingSourceDescriptor
	if json.Unmarshal([]byte(raw), &source) != nil {
		if !enabled {
			return view, nil
		}
		return AutoPriceSyncConfigView{}, errors.New("invalid auto price sync source")
	}
	validated, err := ValidatePricingSourceDescriptor(source)
	if err != nil {
		if !enabled {
			return view, nil
		}
		return AutoPriceSyncConfigView{}, errors.New("invalid auto price sync source")
	}
	view.Source = &validated
	return view, nil
}

func readBoolOption(key string) (bool, error) {
	raw, found, err := readOption(key)
	if err != nil || !found || strings.TrimSpace(raw) == "" {
		return false, err
	}
	value, err := strconv.ParseBool(raw)
	if err != nil {
		return false, errors.New("invalid auto sync option")
	}
	return value, nil
}

func readOption(key string) (string, bool, error) {
	var option model.Option
	err := model.DB.Where(&model.Option{Key: key}).First(&option).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, nil
	}
	return option.Value, err == nil, err
}

func readAutoSyncStatus(eventType string) (AutoSyncStatus, error) {
	status := AutoSyncStatus{}
	if err := model.DB.Model(&model.AutoSyncEvent{}).
		Where("type = ? AND processed_at IS NULL", eventType).
		Count(&status.PendingEvents).Error; err != nil {
		return status, err
	}
	var cursor model.AutoSyncCursor
	if err := model.DB.Where("type = ?", eventType).First(&cursor).Error; err == nil {
		status.DueAt = cursor.DueAt
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return status, err
	}
	active, err := model.GetActiveSystemTask(eventType)
	if err != nil {
		return status, err
	}
	status.Running = projectAutoSyncTask(active)
	var latest model.SystemTask
	err = model.DB.Where("type = ? AND status IN ?", eventType, []model.SystemTaskStatus{model.SystemTaskStatusSucceeded, model.SystemTaskStatusFailed}).
		Order("id DESC").First(&latest).Error
	if err == nil {
		status.Latest = projectAutoSyncTask(&latest)
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return status, err
	}
	return status, nil
}

func projectAutoSyncTask(task *model.SystemTask) *AutoSyncTaskProjection {
	if task == nil {
		return nil
	}
	projection := &AutoSyncTaskProjection{TaskID: task.TaskID, Status: task.Status, CreatedAt: task.CreatedAt, UpdatedAt: task.UpdatedAt}
	if task.Result != "" {
		var result any
		if json.Unmarshal([]byte(task.Result), &result) == nil {
			projection.Result = result
		}
	}
	if task.Error != "" {
		projection.Error = SanitizePricingError(errors.New(task.Error))
	}
	return projection
}
