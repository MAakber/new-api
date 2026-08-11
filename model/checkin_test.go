package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useCheckinDB(t *testing.T) *gorm.DB {
	t.Helper()
	previousDB := DB
	previousDatabaseType := common.MainDatabaseType()
	previousRedisEnabled := common.RedisEnabled
	previousBatchUpdateEnabled := common.BatchUpdateEnabled

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&User{}, &Checkin{}))
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.BatchUpdateEnabled = false

	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		common.RedisEnabled = previousRedisEnabled
		common.BatchUpdateEnabled = previousBatchUpdateEnabled
	})
	return db
}

func TestUserCheckinUsesBalanceTierAndDoesNotAwardTwice(t *testing.T) {
	db := useCheckinDB(t)
	checkinSetting := operation_setting.GetCheckinSetting()
	previousSetting := *checkinSetting
	t.Cleanup(func() { *checkinSetting = previousSetting })
	*checkinSetting = operation_setting.CheckinSetting{
		Enabled:            true,
		MinQuota:           1,
		MaxQuota:           1,
		BalanceTierEnabled: true,
		BalanceTiers: []operation_setting.CheckinBalanceTier{
			{MinBalance: 0, MinReward: 4, MaxReward: 4},
			{MinBalance: 100, MinReward: 11, MaxReward: 11},
		},
	}

	user := User{
		Id:       1,
		Username: "checkin-user",
		Password: "password",
		Status:   common.UserStatusEnabled,
		Quota:    500,
	}
	require.NoError(t, db.Create(&user).Error)

	first, err := UserCheckin(user.Id)
	require.NoError(t, err)
	require.NotNil(t, first)
	assert.Equal(t, 11, first.QuotaAwarded)

	var afterFirst User
	require.NoError(t, db.Select("quota").First(&afterFirst, user.Id).Error)
	assert.Equal(t, 511, afterFirst.Quota)

	second, err := UserCheckin(user.Id)
	require.ErrorContains(t, err, "今日已签到")
	assert.Nil(t, second)

	var afterDuplicate User
	require.NoError(t, db.Select("quota").First(&afterDuplicate, user.Id).Error)
	assert.Equal(t, 511, afterDuplicate.Quota)
	var checkinCount int64
	require.NoError(t, db.Model(&Checkin{}).Where("user_id = ?", user.Id).Count(&checkinCount).Error)
	assert.EqualValues(t, 1, checkinCount)
}

func TestUserCheckinRejectsQuotaOverflowWithoutRecordingAward(t *testing.T) {
	db := useCheckinDB(t)
	checkinSetting := operation_setting.GetCheckinSetting()
	previousSetting := *checkinSetting
	t.Cleanup(func() { *checkinSetting = previousSetting })
	*checkinSetting = operation_setting.CheckinSetting{
		Enabled:  true,
		MinQuota: 1,
		MaxQuota: 1,
	}

	user := User{
		Id:       2,
		Username: "checkin-overflow-user",
		Password: "password",
		Status:   common.UserStatusEnabled,
		Quota:    common.MaxQuota,
	}
	require.NoError(t, db.Create(&user).Error)

	checkin, err := UserCheckin(user.Id)
	require.ErrorContains(t, err, "额度超出安全范围")
	assert.Nil(t, checkin)

	var checkinCount int64
	require.NoError(t, db.Model(&Checkin{}).Where("user_id = ?", user.Id).Count(&checkinCount).Error)
	assert.Zero(t, checkinCount)
}
