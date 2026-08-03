package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

const (
	RedemptionRewardTypeQuota        = "quota"
	RedemptionRewardTypeSubscription = "subscription"
	RedemptionCodeTypeRedemption     = "redemption"
	RedemptionCodeTypeRegistration   = "registration"
)

var ErrRegistrationCodeUnavailable = errors.New("registration code is invalid or unavailable")
var ErrRegistrationCodeChanged = errors.New("registration code changed concurrently")

type Redemption struct {
	Id                     int            `json:"id"`
	UserId                 int            `json:"user_id"`
	Key                    string         `json:"key" gorm:"type:char(32);uniqueIndex"`
	Status                 int            `json:"status" gorm:"default:1"`
	Name                   string         `json:"name" gorm:"index"`
	Quota                  int            `json:"quota" gorm:"default:100"`
	RewardType             string         `json:"reward_type" gorm:"type:varchar(32);not null;default:'quota';index"`
	CodeType               string         `json:"code_type" gorm:"type:varchar(32);not null;default:'redemption';index"`
	PlanId                 int            `json:"plan_id" gorm:"default:0;index"`
	PlanTitle              string         `json:"plan_title,omitempty" gorm:"-"`
	CreatedTime            int64          `json:"created_time" gorm:"bigint"`
	RedeemedTime           int64          `json:"redeemed_time" gorm:"bigint"`
	RedeemedSubscriptionId int            `json:"redeemed_subscription_id" gorm:"default:0;index"`
	Count                  int            `json:"count" gorm:"-:all"` // only for api request
	UsedUserId             int            `json:"used_user_id"`
	DeletedAt              gorm.DeletedAt `gorm:"index"`
	ExpiredTime            int64          `json:"expired_time" gorm:"bigint"` // 过期时间，0 表示不过期
	MaxUses                int            `json:"max_uses" gorm:"default:1"`
	UsedCount              int            `json:"used_count" gorm:"default:0"`
}

type RegistrationCodeUse struct {
	Id           int   `json:"id"`
	RedemptionId int   `json:"redemption_id" gorm:"index"`
	UserId       int   `json:"user_id" gorm:"index"`
	CreatedTime  int64 `json:"created_time" gorm:"bigint"`
}

type RedeemResult struct {
	RewardType     string `json:"reward_type"`
	Quota          int    `json:"quota"`
	PlanId         int    `json:"plan_id,omitempty"`
	PlanTitle      string `json:"plan_title,omitempty"`
	SubscriptionId int    `json:"subscription_id,omitempty"`
}

func NormalizeRedemptionRewardType(rewardType string) string {
	rewardType = strings.ToLower(strings.TrimSpace(rewardType))
	if rewardType == "" {
		return RedemptionRewardTypeQuota
	}
	return rewardType
}

func NormalizeRedemptionCodeType(codeType string) string {
	codeType = strings.ToLower(strings.TrimSpace(codeType))
	if codeType == "" {
		return RedemptionCodeTypeRedemption
	}
	return codeType
}

func (redemption *Redemption) AfterFind(_ *gorm.DB) error {
	redemption.RewardType = NormalizeRedemptionRewardType(redemption.RewardType)
	redemption.CodeType = NormalizeRedemptionCodeType(redemption.CodeType)
	if redemption.CodeType == RedemptionCodeTypeRedemption && redemption.MaxUses <= 0 {
		redemption.MaxUses = 1
	}
	return nil
}

func populateRedemptionPlanTitles(tx *gorm.DB, redemptions []*Redemption) error {
	planIds := make([]int, 0)
	seen := make(map[int]struct{})
	for _, redemption := range redemptions {
		if redemption == nil || redemption.PlanId <= 0 {
			continue
		}
		if _, ok := seen[redemption.PlanId]; ok {
			continue
		}
		seen[redemption.PlanId] = struct{}{}
		planIds = append(planIds, redemption.PlanId)
	}
	if len(planIds) == 0 {
		return nil
	}

	var plans []SubscriptionPlan
	if err := tx.Select("id", "title").Where("id IN ?", planIds).Find(&plans).Error; err != nil {
		return err
	}
	titles := make(map[int]string, len(plans))
	for _, plan := range plans {
		titles[plan.Id] = plan.Title
	}
	for _, redemption := range redemptions {
		if redemption != nil {
			redemption.PlanTitle = titles[redemption.PlanId]
		}
	}
	return nil
}

func applyRedemptionFilters(query *gorm.DB, keyword string, status string) *gorm.DB {
	if keyword != "" {
		if id, err := strconv.Atoi(keyword); err == nil {
			query = query.Where("id = ? OR name LIKE ?", id, keyword+"%")
		} else {
			query = query.Where("name LIKE ?", keyword+"%")
		}
	}

	if status == "" {
		return query
	}
	now := common.GetTimestamp()
	switch status {
	case "expired":
		return query.Where(
			"status = ? AND expired_time != 0 AND expired_time < ?",
			common.RedemptionCodeStatusEnabled,
			now,
		)
	case strconv.Itoa(common.RedemptionCodeStatusEnabled):
		return query.Where(
			"status = ? AND (expired_time = 0 OR expired_time >= ?)",
			common.RedemptionCodeStatusEnabled,
			now,
		)
	case strconv.Itoa(common.RedemptionCodeStatusDisabled):
		return query.Where("status = ?", common.RedemptionCodeStatusDisabled)
	case strconv.Itoa(common.RedemptionCodeStatusUsed):
		return query.Where("status = ?", common.RedemptionCodeStatusUsed)
	default:
		return query
	}
}

func GetAllRedemptions(startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	// 开始事务
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// 获取总数
	err = tx.Model(&Redemption{}).Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// 获取分页数据
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = populateRedemptionPlanTitles(tx, redemptions); err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	// 提交事务
	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return redemptions, total, nil
}

func SearchRedemptions(keyword string, status string, startIdx int, num int) (redemptions []*Redemption, total int64, err error) {
	tx := DB.Begin()
	if tx.Error != nil {
		return nil, 0, tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	query := applyRedemptionFilters(tx.Model(&Redemption{}), keyword, status)

	// Get total count
	err = query.Count(&total).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	// Get paginated data
	err = query.Order("id desc").Limit(num).Offset(startIdx).Find(&redemptions).Error
	if err != nil {
		tx.Rollback()
		return nil, 0, err
	}
	if err = populateRedemptionPlanTitles(tx, redemptions); err != nil {
		tx.Rollback()
		return nil, 0, err
	}

	if err = tx.Commit().Error; err != nil {
		return nil, 0, err
	}

	return redemptions, total, nil
}

func GetRedemptionById(id int) (*Redemption, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	var err error = nil
	err = DB.First(&redemption, "id = ?", id).Error
	if err == nil {
		err = populateRedemptionPlanTitles(DB, []*Redemption{&redemption})
	}
	return &redemption, err
}

func Redeem(key string, userId int) (result *RedeemResult, err error) {
	if key == "" {
		return nil, errors.New("未提供兑换码")
	}
	if userId == 0 {
		return nil, errors.New("无效的 user id")
	}
	redemption := &Redemption{}
	var groupChanged bool

	keyCol := "`key`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		keyCol = `"key"`
	}
	common.RandomSleep()
	err = DB.Transaction(func(tx *gorm.DB) error {
		err := lockForUpdate(tx).Where(keyCol+" = ?", key).First(redemption).Error
		if err != nil {
			return errors.New("无效的兑换码")
		}
		if redemption.Status != common.RedemptionCodeStatusEnabled {
			return errors.New("该兑换码已被使用")
		}
		if NormalizeRedemptionCodeType(redemption.CodeType) != RedemptionCodeTypeRedemption {
			return errors.New("该注册码不能用于兑换")
		}
		if redemption.ExpiredTime != 0 && redemption.ExpiredTime < common.GetTimestamp() {
			return errors.New("该兑换码已过期")
		}
		redemption.RewardType = NormalizeRedemptionRewardType(redemption.RewardType)
		result = &RedeemResult{
			RewardType: redemption.RewardType,
			Quota:      redemption.Quota,
			PlanId:     redemption.PlanId,
		}

		if redemption.RewardType == RedemptionRewardTypeSubscription {
			if redemption.PlanId <= 0 {
				return errors.New("兑换码未关联套餐")
			}
			var plan SubscriptionPlan
			if err := tx.Where("id = ?", redemption.PlanId).First(&plan).Error; err != nil {
				return errors.New("兑换码关联的套餐不存在")
			}
			if !plan.Enabled {
				return errors.New("兑换码关联的套餐已禁用")
			}
			plan.NormalizeDefaults()
			subscription, err := CreateUserSubscriptionFromPlanTx(tx, userId, &plan, "redemption")
			if err != nil {
				return err
			}
			redemption.RedeemedSubscriptionId = subscription.Id
			result.PlanTitle = plan.Title
			result.SubscriptionId = subscription.Id
			groupChanged = subscription.PrevUserGroup != ""
		} else if redemption.RewardType != RedemptionRewardTypeQuota {
			return errors.New("不支持的兑换码类型")
		}
		// Compare-and-swap on status: only the transaction that flips
		// enabled -> used may apply the reward, so a concurrent redeem of the
		// same code loses here even without a row lock (e.g. on SQLite).
		updateResult := tx.Model(&Redemption{}).
			Where("id = ? AND status = ?", redemption.Id, common.RedemptionCodeStatusEnabled).
			Updates(map[string]interface{}{
				"redeemed_time":            common.GetTimestamp(),
				"status":                   common.RedemptionCodeStatusUsed,
				"used_user_id":             userId,
				"redeemed_subscription_id": redemption.RedeemedSubscriptionId,
			})
		if updateResult.Error != nil {
			return updateResult.Error
		}
		if updateResult.RowsAffected == 0 {
			return errors.New("该兑换码已被使用")
		}
		if redemption.RewardType == RedemptionRewardTypeQuota {
			return tx.Model(&User{}).Where("id = ?", userId).Update("quota", gorm.Expr("quota + ?", redemption.Quota)).Error
		}
		return nil
	})
	if err != nil {
		common.SysError("redemption failed: " + err.Error())
		return nil, ErrRedeemFailed
	}
	if groupChanged {
		refreshSubscriptionUserGroupCache(userId, "redemption subscription creation")
	}
	if result.RewardType == RedemptionRewardTypeSubscription {
		RecordLog(userId, LogTypeTopup, fmt.Sprintf("通过兑换码激活订阅套餐 %s，兑换码ID %d，订阅ID %d", result.PlanTitle, redemption.Id, result.SubscriptionId))
	} else {
		RecordLog(userId, LogTypeTopup, fmt.Sprintf("通过兑换码充值 %s，兑换码ID %d", logger.LogQuota(redemption.Quota), redemption.Id))
	}
	return result, nil
}

// ConsumeRegistrationCodeWithTx reserves one use for a newly created account.
// It is intended to run in the same transaction as inserting that account.
func ConsumeRegistrationCodeWithTx(tx *gorm.DB, key string, userID int) error {
	key = strings.TrimSpace(key)
	if tx == nil || key == "" || userID <= 0 {
		return ErrRegistrationCodeUnavailable
	}

	keyCol := "`key`"
	if common.UsingMainDatabase(common.DatabaseTypePostgreSQL) {
		keyCol = `"key"`
	}

	code := &Redemption{}
	if err := lockForUpdate(tx).Where(keyCol+" = ?", key).First(code).Error; err != nil {
		return ErrRegistrationCodeUnavailable
	}
	if NormalizeRedemptionCodeType(code.CodeType) != RedemptionCodeTypeRegistration ||
		code.Status != common.RedemptionCodeStatusEnabled ||
		code.MaxUses <= 0 ||
		code.UsedCount >= code.MaxUses ||
		(code.ExpiredTime != 0 && code.ExpiredTime < common.GetTimestamp()) {
		return ErrRegistrationCodeUnavailable
	}

	nextUsedCount := code.UsedCount + 1
	nextStatus := common.RedemptionCodeStatusEnabled
	if nextUsedCount >= code.MaxUses {
		nextStatus = common.RedemptionCodeStatusUsed
	}
	result := tx.Model(&Redemption{}).
		Where("id = ? AND status = ? AND used_count = ?", code.Id, common.RedemptionCodeStatusEnabled, code.UsedCount).
		Updates(map[string]interface{}{
			"used_count":    nextUsedCount,
			"used_user_id":  userID,
			"redeemed_time": common.GetTimestamp(),
			"status":        nextStatus,
		})
	if result.Error != nil || result.RowsAffected != 1 {
		return ErrRegistrationCodeUnavailable
	}
	if err := tx.Create(&RegistrationCodeUse{
		RedemptionId: code.Id,
		UserId:       userID,
		CreatedTime:  common.GetTimestamp(),
	}).Error; err != nil {
		return err
	}
	return nil
}

func (redemption *Redemption) Insert() error {
	redemption.RewardType = NormalizeRedemptionRewardType(redemption.RewardType)
	redemption.CodeType = NormalizeRedemptionCodeType(redemption.CodeType)
	var err error
	err = DB.Create(redemption).Error
	return err
}

func (redemption *Redemption) SelectUpdate() error {
	// This can update zero values
	return DB.Model(redemption).Select("redeemed_time", "status").Updates(redemption).Error
}

// Update Make sure your token's fields is completed, because this will update non-zero values
func (redemption *Redemption) Update() error {
	var err error
	err = DB.Model(redemption).Select("name", "status", "quota", "reward_type", "plan_id", "redeemed_time", "expired_time", "max_uses").Updates(redemption).Error
	return err
}

// UpdateRegistrationCode prevents an administrator's stale edit from
// overwriting a registration that consumed the code concurrently.
func (redemption *Redemption) UpdateRegistrationCode(expectedStatus int, expectedUsedCount int) error {
	result := DB.Model(&Redemption{}).
		Where("id = ? AND status = ? AND used_count = ?", redemption.Id, expectedStatus, expectedUsedCount).
		Updates(map[string]interface{}{
			"name":         redemption.Name,
			"status":       redemption.Status,
			"expired_time": redemption.ExpiredTime,
			"max_uses":     redemption.MaxUses,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrRegistrationCodeChanged
	}
	return nil
}

func GetRedemptionsForExport(ids []int, keyword string, status string, applyFilters bool) ([]*Redemption, error) {
	query := DB.Model(&Redemption{})
	if len(ids) > 0 {
		query = query.Where("id IN ?", ids)
	}
	if applyFilters {
		query = applyRedemptionFilters(query, keyword, status)
	}
	var redemptions []*Redemption
	if err := query.Order("id desc").Find(&redemptions).Error; err != nil {
		return nil, err
	}
	if err := populateRedemptionPlanTitles(DB, redemptions); err != nil {
		return nil, err
	}
	return redemptions, nil
}

func (redemption *Redemption) Delete() error {
	var err error
	err = DB.Delete(redemption).Error
	return err
}

func DeleteRedemptionById(id int) (err error) {
	if id == 0 {
		return errors.New("id 为空！")
	}
	redemption := Redemption{Id: id}
	err = DB.Where(redemption).First(&redemption).Error
	if err != nil {
		return err
	}
	return redemption.Delete()
}

func DeleteInvalidRedemptions() (int64, error) {
	now := common.GetTimestamp()
	result := DB.Where("status IN ? OR (status = ? AND expired_time != 0 AND expired_time < ?)", []int{common.RedemptionCodeStatusUsed, common.RedemptionCodeStatusDisabled}, common.RedemptionCodeStatusEnabled, now).Delete(&Redemption{})
	return result.RowsAffected, result.Error
}
