package model

import (
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	BannerTypeDefault = "default"
	BannerTypeOngoing = "ongoing"
	BannerTypeSuccess = "success"
	BannerTypeWarning = "warning"
	BannerTypeError   = "error"

	maxBannerContentLength = 500
	maxBannerExtraLength   = 200
	maxBannerLinkLength    = 500
)

var validBannerTypes = map[string]struct{}{
	BannerTypeDefault: {},
	BannerTypeOngoing: {},
	BannerTypeSuccess: {},
	BannerTypeWarning: {},
	BannerTypeError:   {},
}

// Banner stores an independently managed public announcement. Date fields use
// Unix seconds so the table remains portable across SQLite, MySQL, and
// PostgreSQL.
type Banner struct {
	Id          int    `json:"id" gorm:"primaryKey"`
	Content     string `json:"content" gorm:"type:text;not null"`
	PublishDate int64  `json:"-" gorm:"not null"`
	Type        string `json:"type" gorm:"type:varchar(16);not null"`
	Extra       string `json:"extra" gorm:"type:varchar(200);not null"`
	Enabled     bool   `json:"enabled" gorm:"not null"`
	SortOrder   int32  `json:"sort_order" gorm:"not null"`
	StartDate   int64  `json:"-" gorm:"not null"`
	EndDate     int64  `json:"-" gorm:"not null"`
	Link        string `json:"link" gorm:"type:varchar(500);not null"`

	CreatedTime int64 `json:"-" gorm:"not null"`
	UpdatedTime int64 `json:"-" gorm:"not null"`
}

func (Banner) TableName() string {
	return "banners"
}

// Validate enforces the storage-level invariants used by both the API and
// public visibility checks. A zero PublishDate represents a missing date.
func (b Banner) Validate() error {
	if utf8.RuneCountInString(strings.TrimSpace(b.Content)) == 0 {
		return errors.New("banner content is required")
	}
	if utf8.RuneCountInString(b.Content) > maxBannerContentLength {
		return fmt.Errorf("banner content must be at most %d characters", maxBannerContentLength)
	}
	if utf8.RuneCountInString(b.Extra) > maxBannerExtraLength {
		return fmt.Errorf("banner extra must be at most %d characters", maxBannerExtraLength)
	}
	if _, ok := validBannerTypes[b.Type]; !ok {
		return fmt.Errorf("invalid banner type: %s", b.Type)
	}
	if b.PublishDate == 0 {
		return errors.New("banner publish date is required")
	}
	if b.StartDate != 0 && b.EndDate != 0 && b.StartDate > b.EndDate {
		return errors.New("banner start date cannot be later than end date")
	}
	if utf8.RuneCountInString(b.Link) > maxBannerLinkLength {
		return fmt.Errorf("banner link must be at most %d characters", maxBannerLinkLength)
	}
	if b.Link != "" {
		parsed, err := url.Parse(b.Link)
		if err != nil || parsed.Hostname() == "" ||
			(!strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https")) {
			return errors.New("banner link must be a valid HTTP or HTTPS URL")
		}
	}
	return nil
}

func (b Banner) IsPubliclyVisible(now time.Time) bool {
	if err := b.Validate(); err != nil || !b.Enabled {
		return false
	}
	nowUnix := now.Unix()
	if b.StartDate != 0 && nowUnix < b.StartDate {
		return false
	}
	if b.EndDate != 0 && nowUnix > b.EndDate {
		return false
	}
	return true
}

func GetAllBanners() ([]*Banner, error) {
	banners := make([]*Banner, 0)
	err := DB.Order("sort_order DESC").Order("publish_date DESC").Find(&banners).Error
	return banners, err
}

func GetVisibleBanners(now time.Time) ([]*Banner, error) {
	all, err := GetAllBanners()
	if err != nil {
		return nil, err
	}
	visible := make([]*Banner, 0, len(all))
	for _, banner := range all {
		if banner != nil && banner.IsPubliclyVisible(now) {
			visible = append(visible, banner)
		}
	}
	sort.SliceStable(visible, func(i, j int) bool {
		if visible[i].SortOrder != visible[j].SortOrder {
			return visible[i].SortOrder > visible[j].SortOrder
		}
		return visible[i].PublishDate > visible[j].PublishDate
	})
	return visible, nil
}

func GetBannerByID(id int) (*Banner, error) {
	banner := &Banner{}
	if err := DB.First(banner, id).Error; err != nil {
		return nil, err
	}
	return banner, nil
}

func CreateBanner(banner *Banner) error {
	if banner == nil {
		return errors.New("banner is nil")
	}
	if err := banner.Validate(); err != nil {
		return err
	}
	now := common.GetTimestamp()
	if banner.CreatedTime == 0 {
		banner.CreatedTime = now
	}
	if banner.UpdatedTime == 0 {
		banner.UpdatedTime = now
	}
	return DB.Create(banner).Error
}

func UpdateBanner(id int, updates map[string]any) (*Banner, error) {
	if len(updates) == 0 {
		return nil, errors.New("banner update is empty")
	}
	values := make(map[string]any, len(updates)+1)
	for key, value := range updates {
		values[key] = value
	}
	values["updated_time"] = common.GetTimestamp()
	result := DB.Model(&Banner{}).Where("id = ?", id).Updates(values)
	if result.Error != nil {
		return nil, result.Error
	}
	return GetBannerByID(id)
}

func DeleteBanner(id int) error {
	result := DB.Delete(&Banner{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}
