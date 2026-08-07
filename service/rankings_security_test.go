package service

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupRankingSecurityTest(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.UserAutoBanRecord{}, &model.Log{}))
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	rankingCacheMu.Lock()
	rankingAvailabilityCache = map[string]rankingAvailabilityCacheItem{}
	rankingSecurityCache = map[string]rankingSecurityCacheItem{}
	rankingCacheMu.Unlock()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestGetRankingSecuritySortsBansAndProtectsIPRanking(t *testing.T) {
	db := setupRankingSecurityTest(t)
	now := time.Now().Unix()
	records := []model.UserAutoBanRecord{
		{UserId: 1, Username: "frequent-user", RuleType: "user_agent", Mode: "enforce", Status: model.AutoBanRecordStatusReleased, BanDurationMinutes: 60, CreatedAt: now - 300},
		{UserId: 1, Username: "frequent-user", RuleType: "user_agent", Mode: "enforce", Status: model.AutoBanRecordStatusExpired, BanDurationMinutes: 120, CreatedAt: now - 200},
		{UserId: 1, Username: "frequent-user", RuleType: "model_probing", Mode: "enforce", Status: model.AutoBanRecordStatusActive, BanDurationMinutes: 180, CreatedAt: now - 100, ExpiresAt: now + 600},
		{UserId: 2, Username: "recent-user", RuleType: "sensitive_words", Mode: "enforce", Status: model.AutoBanRecordStatusActive, BanDurationMinutes: 30, CreatedAt: now - 10, ExpiresAt: now + 600},
		{UserId: 3, Username: "permanent-user", RuleType: "excessive_ips", Mode: "enforce", Status: model.AutoBanRecordStatusActive, BanDurationMinutes: -1, CreatedAt: now - 400},
		{UserId: 4, Username: "observed-user", RuleType: "user_agent", Mode: "observe", Status: model.AutoBanRecordStatusObserved, BanDurationMinutes: 9999, CreatedAt: now - 5},
	}
	require.NoError(t, db.Create(&records).Error)
	logs := []model.Log{
		{UserId: 1, Username: "frequent-user", Type: model.LogTypeConsume, Ip: "203.0.113.1", CreatedAt: now - 30},
		{UserId: 1, Username: "frequent-user", Type: model.LogTypeConsume, Ip: "203.0.113.2", CreatedAt: now - 20},
		{UserId: 1, Username: "frequent-user", Type: model.LogTypeConsume, Ip: "203.0.113.2", CreatedAt: now - 10},
		{UserId: 2, Username: "recent-user", Type: model.LogTypeConsume, Ip: "203.0.113.3", CreatedAt: now - 10},
	}
	require.NoError(t, db.Create(&logs).Error)

	byCount, err := GetRankingSecurity("today", RankingBanSortCount, false)
	require.NoError(t, err)
	require.Len(t, byCount.Bans, 3)
	assert.Equal(t, "fr*********er", byCount.Bans[0].Username)
	assert.Equal(t, int64(3), byCount.Bans[0].BanCount)
	assert.Nil(t, byCount.IPUsers)
	publicJSON, err := common.Marshal(byCount)
	require.NoError(t, err)
	assert.NotContains(t, string(publicJSON), "ip_users")
	adminByCount, err := GetRankingSecurity("today", RankingBanSortCount, true)
	require.NoError(t, err)
	require.NotNil(t, adminByCount.IPUsers)
	require.Len(t, *adminByCount.IPUsers, 2)

	byLatest, err := GetRankingSecurity("today", RankingBanSortLatest, false)
	require.NoError(t, err)
	assert.Equal(t, "re*******er", byLatest.Bans[0].Username)

	byDuration, err := GetRankingSecurity("today", RankingBanSortDuration, true)
	require.NoError(t, err)
	assert.Equal(t, "pe**********er", byDuration.Bans[0].Username)
	assert.Equal(t, -1, byDuration.Bans[0].LongestBanMinutes)
	require.NotNil(t, byDuration.IPUsers)
	require.Len(t, *byDuration.IPUsers, 2)
	assert.Equal(t, int64(2), (*byDuration.IPUsers)[0].IPCount)
	assert.Equal(t, int64(3), (*byDuration.IPUsers)[0].RequestCount)
}

func TestGetRankingSecurityRejectsUnknownBanSort(t *testing.T) {
	setupRankingSecurityTest(t)
	_, err := GetRankingSecurity("today", "unknown", false)
	require.EqualError(t, err, "invalid ban ranking sort: unknown")
}
