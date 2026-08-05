package model

import (
	"errors"
	"strconv"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestSearchRedemptionsFiltersAndPaginates(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	redemptions := []Redemption{
		{Id: 1, Name: "alpha-active", Key: "00000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: 0},
		{Id: 2, Name: "alpha-future", Key: "00000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now + 3600},
		{Id: 3, Name: "alpha-expired", Key: "00000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 10},
		{Id: 4, Name: "beta-disabled", Key: "00000000000000000000000000000004", Status: common.RedemptionCodeStatusDisabled, ExpiredTime: 0},
		{Id: 5, Name: "beta-used", Key: "00000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed, ExpiredTime: 0},
	}
	require.NoError(t, DB.Create(&redemptions).Error)

	tests := []struct {
		name      string
		keyword   string
		status    string
		startIdx  int
		num       int
		wantTotal int64
		wantIds   []int
	}{
		{
			name:      "no filters returns all rows",
			num:       10,
			wantTotal: 5,
			wantIds:   []int{5, 4, 3, 2, 1},
		},
		{
			name:      "keyword filters by name prefix",
			keyword:   "alpha",
			num:       10,
			wantTotal: 3,
			wantIds:   []int{3, 2, 1},
		},
		{
			name:      "enabled status excludes expired rows",
			status:    "1",
			num:       10,
			wantTotal: 2,
			wantIds:   []int{2, 1},
		},
		{
			name:      "expired status returns enabled expired rows",
			status:    "expired",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "disabled status",
			status:    "2",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "used status",
			status:    "3",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{5},
		},
		{
			name:      "pagination keeps unpaged total",
			startIdx:  1,
			num:       2,
			wantTotal: 5,
			wantIds:   []int{4, 3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := SearchRedemptions(tt.keyword, tt.status, tt.startIdx, tt.num)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			gotIds := make([]int, 0, len(rows))
			for _, row := range rows {
				gotIds = append(gotIds, row.Id)
			}
			assert.Equal(t, tt.wantIds, gotIds)
		})
	}
}

func TestExhaustedRegistrationCodesAreInvalidAndDeleted(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	codes := []Redemption{
		{Name: "active-redemption", Key: "60000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled},
		{Name: "unused-registration", Key: "60000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, CodeType: RedemptionCodeTypeRegistration, MaxUses: 2, UsedCount: 0},
		{Name: "partially-used-registration", Key: "60000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, CodeType: RedemptionCodeTypeRegistration, MaxUses: 2, UsedCount: 1},
		{Name: "exhausted-registration", Key: "60000000000000000000000000000004", Status: common.RedemptionCodeStatusEnabled, CodeType: RedemptionCodeTypeRegistration, MaxUses: 1, UsedCount: 1},
		{Name: "used-redemption", Key: "60000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed},
		{Name: "disabled-redemption", Key: "60000000000000000000000000000006", Status: common.RedemptionCodeStatusDisabled},
		{Name: "expired-redemption", Key: "60000000000000000000000000000007", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 1},
	}
	require.NoError(t, DB.Create(&codes).Error)

	exhausted, err := GetRedemptionById(codes[3].Id)
	require.NoError(t, err)
	assert.Equal(t, common.RedemptionCodeStatusUsed, exhausted.Status)

	enabled, total, err := SearchRedemptions("", strconv.Itoa(common.RedemptionCodeStatusEnabled), 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(3), total)
	require.Len(t, enabled, 3)
	assert.Equal(t, []int{codes[2].Id, codes[1].Id, codes[0].Id}, []int{enabled[0].Id, enabled[1].Id, enabled[2].Id})

	used, total, err := SearchRedemptions("", strconv.Itoa(common.RedemptionCodeStatusUsed), 0, 10)
	require.NoError(t, err)
	assert.Equal(t, int64(2), total)
	require.Len(t, used, 2)
	assert.Equal(t, []int{codes[4].Id, codes[3].Id}, []int{used[0].Id, used[1].Id})

	deleted, err := DeleteInvalidRedemptions()
	require.NoError(t, err)
	assert.Equal(t, int64(4), deleted)

	var remaining []Redemption
	require.NoError(t, DB.Order("id").Find(&remaining).Error)
	require.Len(t, remaining, 3)
	assert.Equal(t,
		[]string{"active-redemption", "unused-registration", "partially-used-registration"},
		[]string{remaining[0].Name, remaining[1].Name, remaining[2].Name},
	)
}

func TestGetRedemptionsForExportSupportsSelectionAndFilters(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
	})

	plan := &SubscriptionPlan{
		Title:         "Export Plan",
		Enabled:       true,
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
	}
	require.NoError(t, DB.Create(plan).Error)
	rows := []Redemption{
		{Name: "export-alpha", Key: "30000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, RewardType: RedemptionRewardTypeQuota, Quota: 100},
		{Name: "export-beta", Key: "30000000000000000000000000000002", Status: common.RedemptionCodeStatusDisabled, RewardType: RedemptionRewardTypeSubscription, PlanId: plan.Id},
		{Name: "other", Key: "30000000000000000000000000000003", Status: common.RedemptionCodeStatusUsed, RewardType: RedemptionRewardTypeQuota, Quota: 200},
	}
	require.NoError(t, DB.Create(&rows).Error)

	selected, err := GetRedemptionsForExport([]int{rows[0].Id, rows[1].Id}, "", "", false)
	require.NoError(t, err)
	require.Len(t, selected, 2)
	assert.Equal(t, rows[1].Id, selected[0].Id)
	assert.Equal(t, "Export Plan", selected[0].PlanTitle)
	assert.Equal(t, rows[0].Id, selected[1].Id)

	filtered, err := GetRedemptionsForExport(nil, "export", strconv.Itoa(common.RedemptionCodeStatusDisabled), true)
	require.NoError(t, err)
	require.Len(t, filtered, 1)
	assert.Equal(t, rows[1].Id, filtered[0].Id)
}

func setupRedeemFixture(t *testing.T, quota int) (userId int, key string) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
	})

	user := &User{Username: "redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(user).Error)

	key = "10000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       quota,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key
}

func TestRedeemCreditsQuotaExactlyOnce(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)

	result, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, RedemptionRewardTypeQuota, result.RewardType)
	assert.Equal(t, 500, result.Quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)

	// Redeeming the same code again must fail and must not credit quota.
	_, err = Redeem(key, userId)
	require.Error(t, err)
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)
}

func setupSubscriptionRedeemFixture(t *testing.T, enabled bool, maxPurchase int) (userId int, key string, planId int) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&UserSubscription{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&UserSubscription{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&SubscriptionPlan{}).Error)
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
	})

	user := &User{Username: "subscription-redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 25}
	require.NoError(t, DB.Create(user).Error)
	plan := &SubscriptionPlan{
		Title:              "Redeem Plan",
		Enabled:            enabled,
		DurationUnit:       SubscriptionDurationMonth,
		DurationValue:      1,
		TotalAmount:        1000,
		MaxPurchasePerUser: maxPurchase,
	}
	require.NoError(t, DB.Create(plan).Error)
	if !enabled {
		require.NoError(t, DB.Model(plan).Update("enabled", false).Error)
	}
	key = "20000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "subscription-redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		RewardType:  RedemptionRewardTypeSubscription,
		PlanId:      plan.Id,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key, plan.Id
}

func TestRedeemCreatesSubscriptionAtomically(t *testing.T) {
	userId, key, planId := setupSubscriptionRedeemFixture(t, true, 2)

	result, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, RedemptionRewardTypeSubscription, result.RewardType)
	assert.Equal(t, planId, result.PlanId)
	assert.Equal(t, "Redeem Plan", result.PlanTitle)
	assert.Positive(t, result.SubscriptionId)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 25, user.Quota, "subscription redemption must not change wallet quota")

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "subscription-redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)
	assert.Equal(t, result.SubscriptionId, redemption.RedeemedSubscriptionId)

	var subscription UserSubscription
	require.NoError(t, DB.First(&subscription, "id = ?", result.SubscriptionId).Error)
	assert.Equal(t, userId, subscription.UserId)
	assert.Equal(t, planId, subscription.PlanId)
	assert.Equal(t, "redemption", subscription.Source)
	assert.Equal(t, int64(1000), subscription.AmountTotal)
}

func TestRedeemDisabledSubscriptionPlanKeepsCodeUnused(t *testing.T) {
	userId, key, _ := setupSubscriptionRedeemFixture(t, false, 0)

	result, err := Redeem(key, userId)
	require.Error(t, err)
	assert.Nil(t, result)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "subscription-redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
	assert.Zero(t, redemption.UsedUserId)
	assert.Zero(t, redemption.RedeemedSubscriptionId)

	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestRedeemSubscriptionPurchaseLimitKeepsCodeUnused(t *testing.T) {
	userId, key, planId := setupSubscriptionRedeemFixture(t, true, 1)
	existing := &UserSubscription{
		UserId:      userId,
		PlanId:      planId,
		AmountTotal: 1000,
		Status:      "active",
		Source:      "order",
		StartTime:   common.GetTimestamp(),
		EndTime:     common.GetTimestamp() + 3600,
	}
	require.NoError(t, DB.Create(existing).Error)

	result, err := Redeem(key, userId)
	require.Error(t, err)
	assert.Nil(t, result)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "subscription-redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
	assert.Zero(t, redemption.RedeemedSubscriptionId)

	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ? AND plan_id = ?", userId, planId).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

// Exactly one of several concurrent redeems of the same code may win, and
// quota must be credited exactly once.
func TestRedeemConcurrentSingleSuccess(t *testing.T) {
	userId, key := setupRedeemFixture(t, 300)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := 0; i < goroutines; i++ {
		go func(idx int) {
			defer wg.Done()
			if _, err := Redeem(key, userId); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount, "exactly one concurrent redeem should succeed")

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 300, user.Quota, "quota must be credited exactly once")
}

func TestConsumeRegistrationCodeWithTxHonorsUsageLimit(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}, &RegistrationCodeUse{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&RegistrationCodeUse{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&RegistrationCodeUse{}).Error)
	})

	code := &Redemption{
		Name:        "registration-test",
		Key:         "40000000000000000000000000000001",
		Status:      common.RedemptionCodeStatusEnabled,
		CodeType:    RedemptionCodeTypeRegistration,
		MaxUses:     2,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(code).Error)

	err := DB.Transaction(func(tx *gorm.DB) error {
		require.NoError(t, ConsumeRegistrationCodeWithTx(tx, code.Key, 100))
		return errors.New("force registration rollback")
	})
	require.Error(t, err)
	var stored Redemption
	require.NoError(t, DB.First(&stored, code.Id).Error)
	assert.Zero(t, stored.UsedCount)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ConsumeRegistrationCodeWithTx(tx, code.Key, 101)
	}))
	require.NoError(t, DB.First(&stored, code.Id).Error)
	assert.Equal(t, 1, stored.UsedCount)
	assert.Equal(t, 101, stored.UsedUserId)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, stored.Status)

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return ConsumeRegistrationCodeWithTx(tx, code.Key, 102)
	}))
	require.NoError(t, DB.First(&stored, code.Id).Error)
	assert.Equal(t, 2, stored.UsedCount)
	assert.Equal(t, 102, stored.UsedUserId)
	assert.Equal(t, common.RedemptionCodeStatusUsed, stored.Status)

	err = DB.Transaction(func(tx *gorm.DB) error {
		return ConsumeRegistrationCodeWithTx(tx, code.Key, 103)
	})
	require.ErrorIs(t, err, ErrRegistrationCodeUnavailable)
	require.NoError(t, DB.First(&stored, code.Id).Error)
	assert.Equal(t, 2, stored.UsedCount)
	var uses []RegistrationCodeUse
	require.NoError(t, DB.Where("redemption_id = ?", code.Id).Order("user_id").Find(&uses).Error)
	require.Len(t, uses, 2)
	assert.Equal(t, []int{101, 102}, []int{uses[0].UserId, uses[1].UserId})
}
