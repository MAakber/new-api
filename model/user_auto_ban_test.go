package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupUserAutoBanModelTest(t *testing.T) {
	t.Helper()
	previousDB := DB
	previousRedis := common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &UserSession{}, &UserSecurityEvent{}, &UserAutoBanRecord{}))
	DB = db
	common.RedisEnabled = false
	t.Cleanup(func() {
		DB = previousDB
		common.RedisEnabled = previousRedis
	})
}

func newAutoBanTestUser(t *testing.T, role int) *User {
	t.Helper()
	user := &User{
		Username: "auto-ban-user", Password: "password", Role: role,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
	}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func TestApplyAndReleaseUserAutoBan(t *testing.T) {
	setupUserAutoBanModelTest(t)
	user := newAutoBanTestUser(t, common.RoleCommonUser)
	record, applied, err := ApplyUserAutoBan(AutoBanActionInput{
		UserId: user.Id, RuleType: "user_agent", Mode: "enforce",
		TriggerCount: 3, Threshold: 3, WindowMinutes: 10, BanDurationMinutes: 60,
		ResponseStatus: 404, ResponseCode: "not_found", ResponseMessage: "Not Found",
		Ip: "203.0.113.5", UserAgent: "blocked", Evidence: `{"matched_pattern":"blocked"}`,
	})
	require.NoError(t, err)
	require.True(t, applied)
	require.Equal(t, AutoBanRecordStatusActive, record.Status)

	var stored User
	require.NoError(t, DB.First(&stored, user.Id).Error)
	response, banned := stored.ActiveAutoBan()
	require.True(t, banned)
	require.Equal(t, 404, response.Status)
	require.Equal(t, "not_found", response.Code)
	require.Greater(t, stored.AuthVersion, int64(1))

	changed, err := ReleaseUserAutoBan(user.Id, 99, "reviewed")
	require.NoError(t, err)
	require.True(t, changed)
	require.NoError(t, DB.First(&stored, user.Id).Error)
	_, banned = stored.ActiveAutoBan()
	require.False(t, banned)
	require.Equal(t, int64(0), stored.AutoBanUntil)

	var released UserAutoBanRecord
	require.NoError(t, DB.First(&released, record.Id).Error)
	require.Equal(t, AutoBanRecordStatusReleased, released.Status)
	require.Equal(t, 99, released.ReleasedBy)
}

func TestAutoBanObservationIsDeduplicatedWithinWindow(t *testing.T) {
	setupUserAutoBanModelTest(t)
	user := newAutoBanTestUser(t, common.RoleCommonUser)
	input := AutoBanActionInput{
		UserId: user.Id, RuleType: "model_probing", Mode: "observe",
		TriggerCount: 20, Threshold: 20, WindowMinutes: 5, BanDurationMinutes: 60,
		ResponseStatus: 403, ResponseCode: "blocked", ResponseMessage: "blocked",
		Evidence: `{}`,
	}
	first, created, err := CreateObservedAutoBanRecord(input)
	require.NoError(t, err)
	require.True(t, created)
	second, created, err := CreateObservedAutoBanRecord(input)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, first.Id, second.Id)
}

func TestExpiredAutoBanAllowsAccess(t *testing.T) {
	user := &User{
		AutoBanUntil:   time.Now().Add(-time.Minute).Unix(),
		AutoBanStatus:  403,
		AutoBanCode:    "blocked",
		AutoBanMessage: "blocked",
	}
	_, banned := user.ActiveAutoBan()
	require.False(t, banned)
}
