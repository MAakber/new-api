package model

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// TEST_ACCOUNTING_DSN selects an explicitly disposable database through the
// shared upgrade fixture. Without it, these contracts run against file SQLite.
func TestAccountingDatabaseContracts(t *testing.T) {
	previousDB, previousLogDB := DB, LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousSQLitePath := common.SQLitePath
	previousRedis, previousBatch, previousQuotaUnit := common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.SQLitePath = previousSQLitePath
		common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit = previousRedis, previousBatch, previousQuotaUnit
		initCol()
	})
	db, dialect := openUpgradeFixtureDB(t, "TEST_ACCOUNTING_DSN", filepath.Join(t.TempDir(), "accounting.db"))
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(dialect, dialect)
	common.RedisEnabled, common.BatchUpdateEnabled, common.QuotaPerUnit = false, false, 100
	initCol()
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(8)
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &TopUp{}, &Log{}, &SubscriptionPlan{}, &SubscriptionOrder{}, &UserSubscription{}, &SubscriptionPreConsumeRecord{}, &Redemption{}))
	var count int64
	require.NoError(t, db.Model(&User{}).Count(&count).Error)
	require.Zero(t, count, "accounting fixtures require an empty disposable database")

	t.Run("concurrent_wallet_and_token_reservations", func(t *testing.T) {
		user := createAccountingFixtureUser(t, "acct-reserve", 100)
		token := Token{UserId: user.Id, Key: "accounting-reserve-key", Name: "auto groups", RemainQuota: 100, UsedQuota: 9, Group: "auto"}
		require.NoError(t, token.SetAutoGroups([]string{"default", "vip"}))
		require.NoError(t, db.Create(&token).Error)
		unavailable := errors.New("quota not reserved")
		for _, target := range []struct {
			name    string
			reserve func() (bool, error)
		}{
			{"wallet", func() (bool, error) { return TryReserveUserQuota(user.Id, 70) }},
			{"token", func() (bool, error) { return TryReserveTokenQuota(token.Id, token.Key, 70, false) }},
		} {
			t.Run(target.name, func(t *testing.T) {
				reserve := func() error {
					ok, err := target.reserve()
					if err != nil {
						return err
					}
					if !ok {
						return unavailable
					}
					return nil
				}
				results := runAccountingOperations(reserve, reserve)
				accepted := 0
				for _, err := range results {
					if err == nil {
						accepted++
					} else {
						assert.ErrorIs(t, err, unavailable)
					}
				}
				assert.Equal(t, 1, accepted)
			})
		}
		require.NoError(t, db.First(&user, user.Id).Error)
		require.NoError(t, db.First(&token, token.Id).Error)
		assert.Equal(t, 30, user.Quota)
		assert.Equal(t, 30, token.RemainQuota)
		assert.Equal(t, 79, token.UsedQuota)
		groups, err := token.GetAutoGroups()
		require.NoError(t, err)
		assert.Equal(t, []string{"default", "vip"}, groups)
	})

	t.Run("duplicate_epay_callback", func(t *testing.T) {
		user := createAccountingFixtureUser(t, "acct-duplicate", 100)
		order := TopUp{UserId: user.Id, TradeNo: "accounting-duplicate", Amount: 2, Money: 2, PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending}
		require.NoError(t, db.Create(&order).Error)
		alreadyDone := make([]bool, 2)
		results := runAccountingOperations(
			func() error {
				var err error
				alreadyDone[0], err = RechargeEpay(order.TradeNo, "alipay", "")
				return err
			},
			func() error {
				var err error
				alreadyDone[1], err = RechargeEpay(order.TradeNo, "alipay", "")
				return err
			},
		)
		for _, err := range results {
			require.NoError(t, err)
		}
		assert.NotEqual(t, alreadyDone[0], alreadyDone[1], "exactly one callback must report the order already complete")
		require.NoError(t, db.First(&user, user.Id).Error)
		require.NoError(t, db.First(&order, order.Id).Error)
		assert.Equal(t, 300, user.Quota)
		assert.Equal(t, common.TopUpStatusSuccess, order.Status)
		var logs int64
		require.NoError(t, db.Model(&Log{}).Where("user_id = ? AND type = ?", user.Id, LogTypeTopup).Count(&logs).Error)
		assert.EqualValues(t, 1, logs, "duplicate callbacks must not duplicate accounting logs")
	})

	t.Run("competing_topups_at_wallet_limit", func(t *testing.T) {
		user := createAccountingFixtureUser(t, "acct-capacity", common.MaxWalletQuota-150)
		orders := []TopUp{
			{UserId: user.Id, TradeNo: "accounting-capacity-a", Amount: 1, Money: 1, PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending},
			{UserId: user.Id, TradeNo: "accounting-capacity-b", Amount: 1, Money: 1, PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending},
		}
		require.NoError(t, db.Create(&orders).Error)
		for range orders {
			require.NoError(t, ValidateTopUpQuotaCapacity(user.Id, 100), "both checkouts initially fit")
		}
		results := runAccountingOperations(
			func() error { _, err := RechargeEpay(orders[0].TradeNo, "alipay", ""); return err },
			func() error { _, err := RechargeEpay(orders[1].TradeNo, "alipay", ""); return err },
		)
		accepted := 0
		for _, err := range results {
			if err == nil {
				accepted++
			} else {
				assert.ErrorIs(t, err, ErrTopUpQuotaLimitExceeded)
			}
		}
		assert.Equal(t, 1, accepted)
		require.NoError(t, db.First(&user, user.Id).Error)
		require.NoError(t, db.Where("user_id = ?", user.Id).Order("id").Find(&orders).Error)
		require.Len(t, orders, 2)
		assert.ElementsMatch(t, []string{common.TopUpStatusPending, common.TopUpStatusSuccess}, []string{orders[0].Status, orders[1].Status})
		assert.Equal(t, common.MaxWalletQuota-50, user.Quota)
		require.NotNil(t, user.RequestsPerMinute)
		assert.Equal(t, 37, *user.RequestsPerMinute)
		assert.EqualValues(t, 7, user.AuthVersion)
		assert.JSONEq(t, `{"billing_preference":"wallet_only"}`, user.Setting)
	})

	t.Run("subscription_purchase_cap_across_grant_paths", func(t *testing.T) {
		user := createAccountingFixtureUser(t, "acct-purchase", 100)
		plan := SubscriptionPlan{Title: "accounting purchase cap", Enabled: true, DurationUnit: SubscriptionDurationDay, DurationValue: 1, TotalAmount: 100, MaxPurchasePerUser: 1}
		require.NoError(t, db.Create(&plan).Error)
		InvalidateSubscriptionPlanCache(plan.Id)
		t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })
		order := SubscriptionOrder{UserId: user.Id, PlanId: plan.Id, TradeNo: "accounting-subscription-order", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", Status: common.TopUpStatusPending}
		code := Redemption{Key: "accounting-subscription-code", RewardType: RedemptionRewardTypeSubscription, PlanId: plan.Id, Status: common.RedemptionCodeStatusEnabled}
		require.NoError(t, db.Create(&order).Error)
		require.NoError(t, db.Create(&code).Error)
		results := runAccountingOperations(
			func() error { _, err := AdminBindSubscription(user.Id, plan.Id, "fixture"); return err },
			func() error { return CompleteSubscriptionOrder(order.TradeNo, "", PaymentProviderEpay, "alipay") },
			func() error { _, err := Redeem(code.Key, user.Id); return err },
		)
		accepted := 0
		for index, err := range results {
			if err == nil {
				accepted++
			} else if index == 2 {
				assert.ErrorIs(t, err, ErrRedeemFailed)
			} else {
				assert.EqualError(t, err, "已达到该套餐购买上限")
			}
		}
		assert.Equal(t, 1, accepted)
		var subscriptions []UserSubscription
		require.NoError(t, db.Where("user_id = ?", user.Id).Find(&subscriptions).Error)
		require.Len(t, subscriptions, 1)
		require.NoError(t, db.First(&order, order.Id).Error)
		require.NoError(t, db.First(&code, code.Id).Error)
		if results[1] != nil {
			assert.Equal(t, common.TopUpStatusPending, order.Status)
		}
		if results[2] != nil {
			assert.Equal(t, common.RedemptionCodeStatusEnabled, code.Status)
			assert.Zero(t, code.RedeemedSubscriptionId)
		}
		require.NoError(t, db.First(&user, user.Id).Error)
		assert.Equal(t, 100, user.Quota, "subscription rewards must not credit wallet quota")
	})

	// SQLite serializes these write transactions at BEGIN IMMEDIATE. On row-
	// locking engines a redemption can read its plan before another grant
	// commits; MySQL's repeatable-read snapshot must not bypass the cap.
	if dialect != common.DatabaseTypeSQLite {
		t.Run("redemption_rechecks_cap_after_concurrent_grant", func(t *testing.T) {
			user := createAccountingFixtureUser(t, "acct-snapshot", 100)
			plan := SubscriptionPlan{Title: "snapshot purchase cap", Enabled: true, DurationUnit: SubscriptionDurationDay, DurationValue: 1, TotalAmount: 100, MaxPurchasePerUser: 1}
			require.NoError(t, db.Create(&plan).Error)
			InvalidateSubscriptionPlanCache(plan.Id)
			t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })
			_, err := GetSubscriptionPlanById(plan.Id)
			require.NoError(t, err)
			code := Redemption{Key: "accounting-snapshot-code", RewardType: RedemptionRewardTypeSubscription, PlanId: plan.Id, Status: common.RedemptionCodeStatusEnabled}
			require.NoError(t, db.Create(&code).Error)

			planRead, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
			var snapshotOnce, releaseOnce sync.Once
			const callbackName = "accounting_redemption_snapshot"
			require.NoError(t, db.Callback().Query().After("gorm:query").Register(callbackName, func(tx *gorm.DB) {
				loaded, ok := tx.Statement.Dest.(*SubscriptionPlan)
				if ok && loaded.Id == plan.Id {
					snapshotOnce.Do(func() { close(planRead); <-release })
				}
			}))
			t.Cleanup(func() {
				releaseOnce.Do(func() { close(release) })
				<-finished
				require.NoError(t, db.Callback().Query().Remove(callbackName))
			})
			result := make(chan error, 1)
			go func() {
				defer close(finished)
				_, err := Redeem(code.Key, user.Id)
				result <- err
			}()
			select {
			case <-planRead:
			case err := <-result:
				require.FailNow(t, "redemption did not reach the plan snapshot", "%v", err)
			}
			_, err = AdminBindSubscription(user.Id, plan.Id, "fixture")
			require.NoError(t, err)
			releaseOnce.Do(func() { close(release) })
			assert.ErrorIs(t, <-result, ErrRedeemFailed)
			var subscriptions int64
			require.NoError(t, db.Model(&UserSubscription{}).Where("user_id = ?", user.Id).Count(&subscriptions).Error)
			assert.EqualValues(t, 1, subscriptions)
			require.NoError(t, db.First(&code, code.Id).Error)
			assert.Equal(t, common.RedemptionCodeStatusEnabled, code.Status)
		})
	}

	t.Run("subscription_reservation_and_atomic_refund", func(t *testing.T) {
		user := createAccountingFixtureUser(t, "acct-subrefund", 100)
		plan := SubscriptionPlan{Title: "accounting subscription", Enabled: true, DurationUnit: SubscriptionDurationDay, DurationValue: 1, TotalAmount: 100}
		require.NoError(t, db.Create(&plan).Error)
		InvalidateSubscriptionPlanCache(plan.Id)
		t.Cleanup(func() { InvalidateSubscriptionPlanCache(plan.Id) })
		_, err := AdminBindSubscription(user.Id, plan.Id, "fixture")
		require.NoError(t, err)
		reservation, err := PreConsumeUserSubscription("accounting-refund", user.Id, "fixture-model", 0, 60)
		require.NoError(t, err)
		repeated, err := PreConsumeUserSubscription("accounting-refund", user.Id, "fixture-model", 0, 60)
		require.NoError(t, err)
		assert.Equal(t, reservation.UserSubscriptionId, repeated.UserSubscriptionId)
		assert.EqualValues(t, 60, repeated.AmountUsedAfter)
		_, err = PreConsumeUserSubscription("accounting-insufficient", user.Id, "fixture-model", 0, 50)
		require.ErrorContains(t, err, "subscription quota insufficient")
		require.ErrorContains(t, PostConsumeUserSubscriptionDelta(reservation.UserSubscriptionId, 41), "exceeds total")

		writeFailure := errors.New("fixture refund-record write failed")
		injected := false
		const callbackName = "accounting_refund_record_failure"
		require.NoError(t, db.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
			if tx.Statement.Table == "subscription_pre_consume_records" && !injected {
				injected = true
				tx.AddError(writeFailure)
			}
		}))
		t.Cleanup(func() { require.NoError(t, db.Callback().Update().Remove(callbackName)) })
		assert.ErrorIs(t, RefundSubscriptionPreConsume("accounting-refund"), writeFailure)
		require.True(t, injected)
		var subscription UserSubscription
		var record SubscriptionPreConsumeRecord
		require.NoError(t, db.First(&subscription, reservation.UserSubscriptionId).Error)
		require.NoError(t, db.Where("request_id = ?", "accounting-refund").First(&record).Error)
		assert.EqualValues(t, 60, subscription.AmountUsed, "failed refund record must roll back the quota change")
		assert.Equal(t, "consumed", record.Status)
		require.NoError(t, RefundSubscriptionPreConsume("accounting-refund"))
		require.NoError(t, RefundSubscriptionPreConsume("accounting-refund"))
		require.NoError(t, db.First(&subscription, subscription.Id).Error)
		require.NoError(t, db.First(&record, record.Id).Error)
		assert.Zero(t, subscription.AmountUsed)
		assert.Equal(t, "refunded", record.Status)
	})
}

func createAccountingFixtureUser(t *testing.T, name string, quota int) User {
	t.Helper()
	user := User{Username: name, Password: "fixture-not-a-login", AffCode: name, Quota: quota, RequestsPerMinute: common.GetPointer(37), AuthVersion: 7, Setting: `{"billing_preference":"wallet_only"}`}
	require.NoError(t, DB.Create(&user).Error)
	return user
}

func runAccountingOperations(operations ...func() error) []error {
	var ready, finished sync.WaitGroup
	ready.Add(len(operations))
	finished.Add(len(operations))
	start := make(chan struct{})
	results := make([]error, len(operations))
	for index, operation := range operations {
		go func() {
			defer finished.Done()
			ready.Done()
			<-start
			results[index] = operation()
		}()
	}
	ready.Wait()
	close(start)
	finished.Wait()
	return results
}
