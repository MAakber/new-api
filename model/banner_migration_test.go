package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateConsoleSettingAnnouncementsToBannersIsIdempotentAndPreservesSource(t *testing.T) {
	db := useBannerDB(t)
	require.NoError(t, db.AutoMigrate(&Option{}))
	legacyItems := []map[string]any{{
		"id":          42,
		"content":     "maintenance",
		"publishDate": "2026-08-09T00:00:00Z",
		"type":        BannerTypeWarning,
		"extra":       "details",
		"enabled":     false,
		"sortOrder":   -3,
		"startDate":   "2026-08-10T00:00:00Z",
		"endDate":     "2026-08-11T00:00:00Z",
		"link":        "https://example.com/maintenance",
	}}
	legacyValueBytes, err := common.Marshal(legacyItems)
	require.NoError(t, err)
	legacyValue := string(legacyValueBytes)
	require.NoError(t, db.Create(&Option{Key: bannerMigrationSourceOptionKey, Value: legacyValue}).Error)

	require.NoError(t, MigrateConsoleSettingAnnouncementsToBanners())
	var banners []Banner
	require.NoError(t, db.Find(&banners).Error)
	require.Len(t, banners, 1)
	assert.Equal(t, 42, banners[0].Id)
	assert.Equal(t, int64(1786233600), banners[0].PublishDate)
	assert.Equal(t, int64(1786320000), banners[0].StartDate)
	assert.Equal(t, int64(1786406400), banners[0].EndDate)
	assert.Equal(t, int32(-3), banners[0].SortOrder)
	assert.False(t, banners[0].Enabled)

	var source Option
	require.NoError(t, db.First(&source, "key = ?", bannerMigrationSourceOptionKey).Error)
	assert.Equal(t, legacyValue, source.Value)
	var marker Option
	require.NoError(t, db.First(&marker, "key = ?", bannerMigrationMarkerOptionKey).Error)

	require.NoError(t, MigrateConsoleSettingAnnouncementsToBanners())
	assert.Equal(t, int64(1), countBanners(t, db))

	require.NoError(t, db.Delete(&banners[0]).Error)
	require.NoError(t, MigrateConsoleSettingAnnouncementsToBanners())
	assert.Equal(t, int64(0), countBanners(t, db))
}

func countBanners(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	var count int64
	require.NoError(t, db.Model(&Banner{}).Count(&count).Error)
	return count
}
