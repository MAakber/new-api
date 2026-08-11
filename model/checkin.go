package model

import (
	"errors"
	"math/rand"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// Checkin 签到记录
type Checkin struct {
	Id           int    `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId       int    `json:"user_id" gorm:"not null;uniqueIndex:idx_user_checkin_date"`
	CheckinDate  string `json:"checkin_date" gorm:"type:varchar(10);not null;uniqueIndex:idx_user_checkin_date"` // 格式: YYYY-MM-DD
	QuotaAwarded int    `json:"quota_awarded" gorm:"not null"`
	CreatedAt    int64  `json:"created_at" gorm:"bigint"`
}

// CheckinRecord 用于API返回的签到记录（不包含敏感字段）
type CheckinRecord struct {
	CheckinDate  string `json:"checkin_date"`
	QuotaAwarded int    `json:"quota_awarded"`
}

func (Checkin) TableName() string {
	return "checkins"
}

// GetUserCheckinRecords 获取用户在指定日期范围内的签到记录
func GetUserCheckinRecords(userId int, startDate, endDate string) ([]Checkin, error) {
	var records []Checkin
	err := DB.Where("user_id = ? AND checkin_date >= ? AND checkin_date <= ?",
		userId, startDate, endDate).
		Order("checkin_date DESC").
		Find(&records).Error
	return records, err
}

// HasCheckedInToday 检查用户今天是否已签到
func HasCheckedInToday(userId int) (bool, error) {
	return hasCheckedInDate(userId, time.Now().Format("2006-01-02"))
}

func hasCheckedInDate(userId int, date string) (bool, error) {
	var count int64
	err := DB.Model(&Checkin{}).
		Where("user_id = ? AND checkin_date = ?", userId, date).
		Count(&count).Error
	return count > 0, err
}

// UserCheckin 执行用户签到。所有支持的主数据库都在同一个事务中完成
// 用户余额读取、当天检查、签到记录写入和额度更新。
func UserCheckin(userId int) (*Checkin, error) {
	setting := *operation_setting.GetCheckinSetting()
	if !setting.Enabled {
		return nil, errors.New("签到功能未启用")
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	var checkin *Checkin
	var quotaAwarded int
	err := DB.Transaction(func(tx *gorm.DB) error {
		// 锁定用户行，使余额读取、奖励选择和额度更新使用同一个余额快照。
		var user User
		userResult := lockForUpdate(tx).
			Select("id", "quota").
			Where("id = ?", userId).
			First(&user)
		if userResult.Error != nil {
			return userResult.Error
		}
		if userResult.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}

		var count int64
		if err := tx.Model(&Checkin{}).
			Where("user_id = ? AND checkin_date = ?", userId, today).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			return errors.New("今日已签到")
		}

		var err error
		quotaAwarded, err = checkinQuotaAwarded(setting, user.Quota)
		if err != nil {
			return err
		}
		if !canAddCheckinQuota(user.Quota, quotaAwarded) {
			return errors.New("签到失败：额度超出安全范围")
		}

		checkin = newCheckin(userId, today, now.Unix(), quotaAwarded)
		// 数据库有唯一约束 (user_id, checkin_date)，可以防止并发重复签到
		if err := tx.Create(checkin).Error; err != nil {
			return errors.New("签到失败，请稍后重试")
		}

		// 步骤2: 在事务中增加用户额度
		quotaResult := tx.Model(&User{}).
			Where("id = ?", userId).
			Update("quota", gorm.Expr("quota + ?", quotaAwarded))
		if quotaResult.Error != nil || quotaResult.RowsAffected != 1 {
			return errors.New("签到失败：更新额度出错")
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	// 事务成功后，异步更新缓存
	go func() {
		_ = cacheIncrUserQuota(userId, int64(quotaAwarded))
	}()

	return checkin, nil
}

func checkinQuotaAwarded(setting operation_setting.CheckinSetting, balance int) (int, error) {
	quotaAwarded, err := setting.GetCheckinQuotaForBalance(balance, rand.Intn)
	if err != nil {
		common.SysError("invalid check-in reward setting: " + err.Error())
		return 0, errors.New("签到奖励配置无效")
	}
	if quotaAwarded < 0 || quotaAwarded > common.MaxQuota {
		common.SysError("check-in reward is outside the safe quota range")
		return 0, errors.New("签到奖励配置无效")
	}
	return quotaAwarded, nil
}

func canAddCheckinQuota(balance, reward int) bool {
	if balance < common.MinQuota || balance > common.MaxQuota || reward < 0 || reward > common.MaxQuota {
		return false
	}
	return int64(balance)+int64(reward) <= int64(common.MaxQuota)
}

func newCheckin(userId int, date string, createdAt int64, quotaAwarded int) *Checkin {
	return &Checkin{
		UserId:       userId,
		CheckinDate:  date,
		QuotaAwarded: quotaAwarded,
		CreatedAt:    createdAt,
	}
}

// GetUserCheckinStats 获取用户签到统计信息
func GetUserCheckinStats(userId int, month string) (map[string]interface{}, error) {
	// 获取指定月份的所有签到记录
	startDate := month + "-01"
	endDate := month + "-31"

	records, err := GetUserCheckinRecords(userId, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// 转换为不包含敏感字段的记录
	checkinRecords := make([]CheckinRecord, len(records))
	for i, r := range records {
		checkinRecords[i] = CheckinRecord{
			CheckinDate:  r.CheckinDate,
			QuotaAwarded: r.QuotaAwarded,
		}
	}

	// 检查今天是否已签到
	hasCheckedToday, _ := HasCheckedInToday(userId)

	// 获取用户所有时间的签到统计
	var totalCheckins int64
	var totalQuota int64
	DB.Model(&Checkin{}).Where("user_id = ?", userId).Count(&totalCheckins)
	DB.Model(&Checkin{}).Where("user_id = ?", userId).Select("COALESCE(SUM(quota_awarded), 0)").Scan(&totalQuota)

	return map[string]interface{}{
		"total_quota":      totalQuota,      // 所有时间累计获得的额度
		"total_checkins":   totalCheckins,   // 所有时间累计签到次数
		"checkin_count":    len(records),    // 本月签到次数
		"checked_in_today": hasCheckedToday, // 今天是否已签到
		"records":          checkinRecords,  // 本月签到记录详情（不含id和user_id）
	}, nil
}
