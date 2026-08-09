package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useBannerDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousType := common.MainDatabaseType()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Banner{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousType)
	})
	return db
}

func TestGetVisibleBannersFiltersInvalidLifecycleRecordsAndSorts(t *testing.T) {
	db := useBannerDB(t)
	now := time.Unix(2_000_000_000, 0)
	records := []Banner{
		{Content: "high old", PublishDate: now.Unix() - 20, Type: BannerTypeDefault, Enabled: true, SortOrder: 10},
		{Content: "high new", PublishDate: now.Unix() - 10, Type: BannerTypeDefault, Enabled: true, SortOrder: 10},
		{Content: "low", PublishDate: now.Unix(), Type: BannerTypeSuccess, Enabled: true, SortOrder: 0},
		{Content: "disabled", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: false},
		{Content: "future", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: true, StartDate: now.Unix() + 1},
		{Content: "expired", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: true, EndDate: now.Unix() - 1},
		{Content: "", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: true},
		{Content: "bad type", PublishDate: now.Unix(), Type: "invalid", Enabled: true},
		{Content: "bad date", PublishDate: 0, Type: BannerTypeDefault, Enabled: true},
		{Content: "bad link", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: true, Link: "javascript:alert(1)"},
		{Content: "bad range", PublishDate: now.Unix(), Type: BannerTypeDefault, Enabled: true, StartDate: now.Unix() + 10, EndDate: now.Unix() + 5},
	}
	require.NoError(t, db.Create(&records).Error)

	visible, err := GetVisibleBanners(now)
	require.NoError(t, err)
	require.Len(t, visible, 3)
	assert.Equal(t, "high new", visible[0].Content)
	assert.Equal(t, "high old", visible[1].Content)
	assert.Equal(t, "low", visible[2].Content)
}

func TestUpdateBannerPersistsExplicitZeroFalseAndEmptyValues(t *testing.T) {
	useBannerDB(t)
	banner := Banner{
		Content:     "notice",
		PublishDate: 2_000_000_000,
		Type:        BannerTypeWarning,
		Extra:       "details",
		Enabled:     true,
		SortOrder:   8,
		StartDate:   2_000_000_100,
		EndDate:     2_000_000_200,
		Link:        "https://example.com",
	}
	require.NoError(t, CreateBanner(&banner))

	updated, err := UpdateBanner(banner.Id, map[string]any{
		"enabled":    false,
		"sort_order": int32(0),
		"extra":      "",
		"start_date": int64(0),
		"end_date":   int64(0),
		"link":       "",
	})
	require.NoError(t, err)
	assert.False(t, updated.Enabled)
	assert.Zero(t, updated.SortOrder)
	assert.Empty(t, updated.Extra)
	assert.Zero(t, updated.StartDate)
	assert.Zero(t, updated.EndDate)
	assert.Empty(t, updated.Link)
}
