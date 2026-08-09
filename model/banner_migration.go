package model

import (
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	bannerMigrationSourceOptionKey = "console_setting.announcements"
	bannerMigrationMarkerOptionKey = "migration.banners_from_console_setting.announcements.v1"
)

// MigrateConsoleSettingAnnouncementsToBanners copies the current legacy
// console-setting announcements once. The source option is deliberately left
// untouched; the marker option prevents later restarts from recreating rows
// that an administrator deleted from the Banner table.
func MigrateConsoleSettingAnnouncementsToBanners() error {
	if DB == nil {
		return errors.New("database is not initialized")
	}

	return DB.Transaction(func(tx *gorm.DB) error {
		var marker Option
		err := tx.Where(&Option{Key: bannerMigrationMarkerOptionKey}).First(&marker).Error
		if err == nil {
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("read banner migration marker: %w", err)
		}

		var source Option
		err = tx.Where(&Option{Key: bannerMigrationSourceOptionKey}).First(&source).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return tx.Create(&Option{Key: bannerMigrationMarkerOptionKey, Value: "done"}).Error
		}
		if err != nil {
			return fmt.Errorf("read legacy banner option: %w", err)
		}
		if strings.TrimSpace(source.Value) == "" {
			return tx.Create(&Option{Key: bannerMigrationMarkerOptionKey, Value: "done"}).Error
		}

		var items []map[string]any
		if err := common.UnmarshalJsonStr(source.Value, &items); err != nil {
			return fmt.Errorf("parse legacy banner option: %w", err)
		}
		usedIDs := make(map[int]struct{}, len(items))
		now := common.GetTimestamp()
		for index, item := range items {
			banner, err := legacyBanner(item, now)
			if err != nil {
				common.SysError(fmt.Sprintf("legacy banner %d was not migrated: %v", index+1, err))
				continue
			}
			if banner.Id > 0 {
				if _, exists := usedIDs[banner.Id]; exists {
					banner.Id = 0
				} else {
					var existing Banner
					existingErr := tx.First(&existing, banner.Id).Error
					if existingErr == nil {
						banner.Id = 0
					} else if !errors.Is(existingErr, gorm.ErrRecordNotFound) {
						return fmt.Errorf("check migrated banner id %d: %w", banner.Id, existingErr)
					}
				}
			}
			if banner.Id > 0 {
				usedIDs[banner.Id] = struct{}{}
			}
			if err := tx.Create(&banner).Error; err != nil {
				return fmt.Errorf("create migrated banner %d: %w", index+1, err)
			}
		}
		return tx.Create(&Option{Key: bannerMigrationMarkerOptionKey, Value: "done"}).Error
	})
}

// MigrateAnnouncementsToBanners is kept as a concise alias for callers that
// refer to the migration by its legacy feature name.
func MigrateAnnouncementsToBanners() error {
	return MigrateConsoleSettingAnnouncementsToBanners()
}

func legacyBanner(item map[string]any, now int64) (Banner, error) {
	content, ok := item["content"].(string)
	if !ok {
		return Banner{}, errors.New("content is missing or invalid")
	}
	publishDate, err := legacyBannerDate(item, "publishDate", true)
	if err != nil {
		return Banner{}, err
	}
	typeValue := BannerTypeDefault
	if raw, exists := item["type"]; exists && raw != nil {
		value, ok := raw.(string)
		if !ok {
			return Banner{}, errors.New("type is invalid")
		}
		typeValue = strings.TrimSpace(value)
		if typeValue == "" {
			typeValue = BannerTypeDefault
		}
	}
	extra := ""
	if raw, exists := item["extra"]; exists && raw != nil {
		var ok bool
		extra, ok = raw.(string)
		if !ok {
			return Banner{}, errors.New("extra is invalid")
		}
	}
	enabled := true
	if raw, exists := item["enabled"]; exists && raw != nil {
		var ok bool
		enabled, ok = raw.(bool)
		if !ok {
			return Banner{}, errors.New("enabled is invalid")
		}
	}
	sortOrder := int32(0)
	if raw, exists := item["sortOrder"]; exists && raw != nil {
		value, ok := legacyBannerInt32(raw)
		if !ok {
			return Banner{}, errors.New("sortOrder is invalid")
		}
		sortOrder = value
	}
	startDate, err := legacyBannerDate(item, "startDate", false)
	if err != nil {
		return Banner{}, err
	}
	endDate, err := legacyBannerDate(item, "endDate", false)
	if err != nil {
		return Banner{}, err
	}
	link := ""
	if raw, exists := item["link"]; exists && raw != nil {
		var ok bool
		link, ok = raw.(string)
		if !ok {
			return Banner{}, errors.New("link is invalid")
		}
		link = strings.TrimSpace(link)
	}
	banner := Banner{
		Content:     content,
		PublishDate: publishDate,
		Type:        typeValue,
		Extra:       extra,
		Enabled:     enabled,
		SortOrder:   sortOrder,
		StartDate:   startDate,
		EndDate:     endDate,
		Link:        link,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if raw, exists := item["id"]; exists && raw != nil {
		if id, ok := legacyBannerInt64(raw); ok && id > 0 && id <= int64(^uint(0)>>1) {
			banner.Id = int(id)
		}
	}
	if err := banner.Validate(); err != nil {
		return Banner{}, err
	}
	return banner, nil
}

func legacyBannerDate(item map[string]any, field string, required bool) (int64, error) {
	raw, exists := item[field]
	if !exists || raw == nil {
		if required {
			return 0, fmt.Errorf("%s is missing", field)
		}
		return 0, nil
	}
	value, ok := raw.(string)
	if !ok {
		if required {
			return 0, fmt.Errorf("%s is invalid", field)
		}
		return 0, fmt.Errorf("%s is invalid", field)
	}
	if strings.TrimSpace(value) == "" {
		if required {
			return 0, fmt.Errorf("%s is invalid", field)
		}
		return 0, nil
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(value))
	if err != nil {
		return 0, fmt.Errorf("%s is invalid", field)
	}
	return parsed.Unix(), nil
}

func legacyBannerInt64(value any) (int64, bool) {
	floatValue, ok := value.(float64)
	if !ok || math.IsNaN(floatValue) || math.IsInf(floatValue, 0) || floatValue != math.Trunc(floatValue) {
		return 0, false
	}
	if floatValue < float64(math.MinInt64) || floatValue > float64(math.MaxInt64) {
		return 0, false
	}
	return int64(floatValue), true
}

func legacyBannerInt32(value any) (int32, bool) {
	parsed, ok := legacyBannerInt64(value)
	if !ok || parsed < math.MinInt32 || parsed > math.MaxInt32 {
		return 0, false
	}
	return int32(parsed), true
}
