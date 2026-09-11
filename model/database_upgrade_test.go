package model

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// The same fixture can be copied into a released checkout and run with phase
// "seed", then run here with phase "verify" against its disposable databases.
// It exercises real startup and stored downstream data, including a separate
// log database. External database names must start with codex_sync_.
func TestDatabaseUpgradePreservesDownstreamData(t *testing.T) {
	phase := os.Getenv("TEST_UPGRADE_PHASE")
	if phase == "" {
		phase = "fresh"
	}
	require.Contains(t, []string{"fresh", "seed", "verify"}, phase)
	previousDB, previousLogDB := DB, LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousSQLitePath := common.SQLitePath
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.SQLitePath = previousSQLitePath
		initCol()
	})
	fixtureDirectory := os.Getenv("TEST_UPGRADE_SQLITE_DIR")
	if fixtureDirectory == "" {
		fixtureDirectory = t.TempDir()
	}
	mainDB, mainType := openUpgradeFixtureDB(t, "TEST_UPGRADE_DSN", filepath.Join(fixtureDirectory, "main.db"))
	logDB, logType := openUpgradeFixtureDB(t, "TEST_UPGRADE_LOG_DSN", filepath.Join(fixtureDirectory, "log.db"))
	recorder := &migrationSQLRecorder{}
	DB, LOG_DB = mainDB.Session(&gorm.Session{Logger: recorder}), logDB.Session(&gorm.Session{Logger: recorder})
	common.SetDatabaseTypes(mainType, logType)
	initCol()
	require.NoError(t, migrateDB(), "main startup migration")
	require.NoError(t, migrateLOGDB(), "separate log startup migration")
	if phase != "verify" {
		seedDatabaseUpgradeFixture(t)
	}
	if phase == "seed" {
		t.Log("released schema and downstream data seeded; verification belongs to the upgraded checkout")
		return
	}
	for restart := 1; restart <= 2; restart++ {
		recorder.reset()
		require.NoError(t, migrateDB())
		require.NoError(t, migrateLOGDB())
		assert.Empty(t, recorder.schemaMutations(), "unchanged restart %d must not issue DDL", restart)
	}
	verifyDatabaseUpgradeFixture(t)
}

func openUpgradeFixtureDB(t *testing.T, envName, sqlitePath string) (*gorm.DB, common.DatabaseType) {
	t.Helper()
	dsn := os.Getenv(envName)
	if dsn == "" || dsn == "local" {
		t.Setenv(envName, "local")
		if os.Getenv("TEST_UPGRADE_SQLITE_DIR") != "" {
			require.True(t, strings.HasPrefix(filepath.Base(filepath.Dir(sqlitePath)), "codex_sync_"), "SQLite upgrades require a disposable fixture directory")
		}
		require.NoError(t, os.MkdirAll(filepath.Dir(sqlitePath), 0o700))
		common.SQLitePath = sqlitePath + "?_pragma=busy_timeout(30000)&_pragma=journal_mode(WAL)&_txlock=immediate"
	} else if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		parsed, err := url.Parse(dsn)
		require.NoError(t, err)
		require.True(t, strings.HasPrefix(strings.TrimPrefix(parsed.Path, "/"), "codex_sync_"), "only disposable databases may be upgraded by this fixture")
	} else {
		parsed, err := mysqldriver.ParseDSN(dsn)
		require.NoError(t, err)
		require.True(t, strings.HasPrefix(parsed.DBName, "codex_sync_"), "only disposable databases may be upgraded by this fixture")
	}
	db, dialect, err := chooseDB(envName, strings.Contains(envName, "LOG"))
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	var version string
	query := "SELECT VERSION()"
	if dialect == common.DatabaseTypeSQLite {
		query = "SELECT sqlite_version()"
	}
	require.NoError(t, db.Raw(query).Scan(&version).Error)
	t.Logf("%s: %s", envName, version)
	return db, dialect
}

func seedDatabaseUpgradeFixture(t *testing.T) {
	t.Helper()
	user := User{Id: 9101, Username: "sync-fixture", Password: "fixture-not-a-login", DisplayName: "保留用户", AffCode: "sync-fixture", Quota: 1234567, UsedQuota: 7654, AuthVersion: 7, Setting: `{"billing_preference":"wallet_only"}`}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Create(&Token{Id: 9101, UserId: user.Id, Name: "long-token", Key: strings.Repeat("a", 100), RemainQuota: 654321, UsedQuota: 1234}).Error)
	require.NoError(t, DB.Create(&UserSession{SID: "sync-session", UserID: user.Id, UserAuthVersion: 7, Status: "active", RefreshHash: strings.Repeat("b", 64), PreviousRefreshHash: strings.Repeat("c", 60), LoginMethod: "passkey", ExpiresAt: 2000000000}).Error)
	for index, name := range []string{"笔记本", "手机"} {
		require.NoError(t, DB.Create(&PasskeyCredential{ID: 9101 + index, UserID: user.Id, CredentialID: fmt.Sprintf("fixture-credential-%d", index), DisplayName: name, PublicKey: "fixture-public-key", SignCount: 42, BackupEligible: true}).Error)
	}
	require.NoError(t, DB.Create(&UserAvatar{ID: 9101, UserID: user.Id, ObjectKey: "fixture/avatar.png", MimeType: "image/png", Size: 128, Width: 16, Height: 16, SHA256: strings.Repeat("d", 64), Version: 3}).Error)
	require.NoError(t, DB.Create(&RegistrationCodeUse{Id: 9101, RedemptionId: 9102, UserId: user.Id, CreatedTime: 1789000000}).Error)
	require.NoError(t, DB.Create(&Banner{Id: 9101, Content: "保留公告", PublishDate: 1789000000, Type: BannerTypeDefault, Enabled: true}).Error)
	for channelType := 61; channelType <= 64; channelType++ {
		channel := Channel{Id: channelType, Type: channelType, Key: "fixture-channel-key", Name: fmt.Sprintf("compat-%d", channelType), Models: "legacy-model", ConfigRevision: 9, ChannelInfo: ChannelInfo{IsMultiKey: true, MultiKeySize: 2, MultiKeyStatusList: map[int]int{0: 1, 1: 3}, MultiKeyDisabledReason: map[int]string{1: "保留禁用原因"}}}
		require.NoError(t, DB.Create(&channel).Error)
	}
	require.NoError(t, DB.Create(&ChannelCustomBalance{ChannelID: 61, Enabled: true, Provider: "new-api", EncryptedCredential: "fixture-encrypted-value", BalanceInterval: 3600, AutoCheckin: true, NextCheckinAt: 1900000000}).Error)
	require.NoError(t, DB.Create(&AutoSyncCursor{Type: "fixture-sync", Generation: 15, DueAt: 1900000000, UpdatedAt: 1789000000}).Error)
	require.NoError(t, DB.Create(&AutoSyncEvent{ID: 9101, Type: "fixture-sync", Generation: 15, ChannelID: 61, Trigger: "manual", State: `{"processed":false}`, EventAt: 1789000000, CreatedAt: 1789000000}).Error)
	task := Task{ID: 9101, TaskID: "fixture-video", UserId: user.Id, ChannelId: 61, Quota: 500, Status: TaskStatusInProgress, Properties: Properties{Input: "保留视频", OriginModelName: "legacy-model"}, PrivateData: TaskPrivateData{UpstreamTaskID: "upstream-fixture", BillingSource: "wallet", TokenId: 9101, NodeName: "fixture-node", BillingContext: &TaskBillingContext{ModelPrice: 0.02, GroupRatio: 1.5, PerCallBilling: true}}}
	task.SetData(map[string]any{"progress": 0, "ready": false})
	require.NoError(t, DB.Create(&task).Error)
	require.NoError(t, DB.Create(&PrefillGroup{Id: 9101, Name: "保留预填", Type: "model", Items: JSONValue(`["legacy-model"]`)}).Error)
	require.NoError(t, DB.Create(&Option{Key: "ModelPrice", Value: `{"legacy-model":0.02345}`}).Error)
	// Seed historical identities directly; current metadata APIs allocate IDs.
	require.NoError(t, DB.Create(&Vendor{Id: 9101, Name: "legacy-vendor", ActiveName: common.GetPointer("legacy-vendor"), Description: "保留供应商"}).Error)
	require.NoError(t, DB.Create(&Model{Id: 9101, ModelName: "legacy-model", ActiveName: common.GetPointer("legacy-model"), VendorID: 9101, Description: "保留模型"}).Error)
	require.NoError(t, LOG_DB.Create(&Log{Id: 9101, UserId: user.Id, Type: 2, CreatedAt: 1789000000, ModelName: "legacy-model", Quota: 500, RequestId: "fixture-request", Other: `{"admin_info":{"quota_saturation":{"reason":"fixture"}}}`}).Error)
}

func verifyDatabaseUpgradeFixture(t *testing.T) {
	t.Helper()
	var user User
	require.NoError(t, DB.First(&user, 9101).Error)
	assert.Equal(t, "保留用户", user.DisplayName)
	assert.Equal(t, 1234567, user.Quota)
	assert.Equal(t, 7654, user.UsedQuota)
	assert.EqualValues(t, 7, user.AuthVersion)
	assert.JSONEq(t, `{"billing_preference":"wallet_only"}`, user.Setting)
	var token Token
	require.NoError(t, DB.First(&token, 9101).Error)
	assert.Equal(t, strings.Repeat("a", 100), token.Key)
	assert.Equal(t, 654321, token.RemainQuota)
	assert.Equal(t, 1234, token.UsedQuota)
	var session UserSession
	require.NoError(t, DB.Where("sid = ?", "sync-session").First(&session).Error)
	assert.Equal(t, strings.Repeat("c", 60), session.PreviousRefreshHash)
	assert.Equal(t, "active", session.Status)
	assert.EqualValues(t, 7, session.UserAuthVersion)
	var credentials []PasskeyCredential
	require.NoError(t, DB.Where("user_id = ?", user.Id).Order("id").Find(&credentials).Error)
	require.Len(t, credentials, 2)
	assert.Equal(t, "笔记本", credentials[0].DisplayName)
	assert.Equal(t, "手机", credentials[1].DisplayName)
	assert.EqualValues(t, 42, credentials[0].SignCount)
	assert.True(t, credentials[0].BackupEligible)
	avatar, err := GetUserAvatar(user.Id)
	require.NoError(t, err)
	require.NotNil(t, avatar)
	assert.Equal(t, "fixture/avatar.png", avatar.ObjectKey)
	assert.EqualValues(t, 3, avatar.Version)
	var registration RegistrationCodeUse
	require.NoError(t, DB.First(&registration, 9101).Error)
	assert.Equal(t, user.Id, registration.UserId)
	var banner Banner
	require.NoError(t, DB.First(&banner, 9101).Error)
	assert.Equal(t, "保留公告", banner.Content)
	assert.True(t, banner.Enabled)
	for channelType := 61; channelType <= 64; channelType++ {
		var channel Channel
		require.NoError(t, DB.First(&channel, channelType).Error)
		assert.Equal(t, channelType, channel.Type)
		assert.Equal(t, "legacy-model", channel.Models)
		assert.EqualValues(t, 9, channel.ConfigRevision)
		assert.Equal(t, 3, channel.ChannelInfo.MultiKeyStatusList[1])
		assert.Equal(t, "保留禁用原因", channel.ChannelInfo.MultiKeyDisabledReason[1])
	}
	balance, err := GetChannelCustomBalance(61)
	require.NoError(t, err)
	require.NotNil(t, balance)
	assert.Equal(t, "fixture-encrypted-value", balance.EncryptedCredential)
	assert.True(t, balance.AutoCheckin)
	assert.EqualValues(t, 1900000000, balance.NextCheckinAt)
	var cursor AutoSyncCursor
	require.NoError(t, DB.Where("type = ?", "fixture-sync").First(&cursor).Error)
	assert.EqualValues(t, 15, cursor.Generation)
	var event AutoSyncEvent
	require.NoError(t, DB.First(&event, 9101).Error)
	assert.JSONEq(t, `{"processed":false}`, event.State)
	var task Task
	require.NoError(t, DB.First(&task, 9101).Error)
	assert.Equal(t, TaskStatus(TaskStatusInProgress), task.Status)
	assert.Equal(t, "保留视频", task.Properties.Input)
	assert.Equal(t, "upstream-fixture", task.GetUpstreamTaskID())
	assert.Equal(t, "wallet", task.PrivateData.BillingSource)
	require.NotNil(t, task.PrivateData.BillingContext)
	assert.Equal(t, 0.02, task.PrivateData.BillingContext.ModelPrice)
	assert.True(t, task.PrivateData.BillingContext.PerCallBilling)
	assert.JSONEq(t, `{"progress":0,"ready":false}`, string(task.Data))
	var prefill PrefillGroup
	require.NoError(t, DB.First(&prefill, 9101).Error)
	assert.JSONEq(t, `["legacy-model"]`, string(prefill.Items))
	var price Option
	require.NoError(t, DB.Where(&Option{Key: "ModelPrice"}).First(&price).Error)
	assert.JSONEq(t, `{"legacy-model":0.02345}`, price.Value)
	var storedModel Model
	var storedVendor Vendor
	require.NoError(t, DB.First(&storedModel, 9101).Error)
	require.NoError(t, DB.First(&storedVendor, 9101).Error)
	assert.Equal(t, "保留模型", storedModel.Description)
	assert.Equal(t, "保留供应商", storedVendor.Description)
	require.NotNil(t, storedModel.ActiveName)
	require.NotNil(t, storedVendor.ActiveName)
	assert.Equal(t, storedModel.ModelName, *storedModel.ActiveName)
	assert.Equal(t, storedVendor.Name, *storedVendor.ActiveName)
	duplicateModel := Model{ModelName: storedModel.ModelName}
	duplicateVendor := Vendor{Name: storedVendor.Name}
	require.NoError(t, duplicateModel.Insert())
	require.NoError(t, duplicateVendor.Insert())
	assert.Equal(t, storedModel.Id, duplicateModel.Id)
	assert.Equal(t, storedVendor.Id, duplicateVendor.Id)
	var logRow Log
	require.NoError(t, LOG_DB.First(&logRow, 9101).Error)
	assert.Equal(t, 500, logRow.Quota)
	assert.Equal(t, "fixture-request", logRow.RequestId)
	assert.JSONEq(t, `{"admin_info":{"quota_saturation":{"reason":"fixture"}}}`, logRow.Other)
	t.Run("task_state_noop_keeps_only_a_valid_lease", func(t *testing.T) {
		state := testSystemTaskState{Total: 10, Processed: 10, Progress: 100, Remaining: 0}
		task, err := CreateSystemTask("fixture-startup-state", nil, state)
		require.NoError(t, err)
		t.Cleanup(func() {
			require.NoError(t, DB.Where("task_id = ?", task.TaskID).Delete(&SystemTaskLock{}).Error)
			require.NoError(t, DB.Where("task_id = ?", task.TaskID).Delete(&SystemTask{}).Error)
		})
		_, claimed, err := ClaimSystemTask(task.ID, task.Type, "fixture-runner", common.GetTimestamp()+60)
		require.NoError(t, err)
		require.True(t, claimed)
		var storedTask SystemTask
		require.NoError(t, DB.First(&storedTask, task.ID).Error)
		// Freeze only the timestamp of this fixture's state write. This forces
		// an actual unchanged-row UPDATE without depending on wall-clock timing.
		const callback = "fixture:unchanged_task_state"
		require.NoError(t, DB.Callback().Update().Before("gorm:update").Register(callback, func(tx *gorm.DB) {
			values, ok := tx.Statement.Dest.(map[string]interface{})
			if ok && tx.Statement.Table == "system_tasks" && values["state"] != nil {
				values["updated_at"] = storedTask.UpdatedAt
			}
		}))
		t.Cleanup(func() { require.NoError(t, DB.Callback().Update().Remove(callback)) })
		var changedRows int64 = -1
		require.NoError(t, DB.Callback().Update().After("gorm:update").Register(callback+":result", func(tx *gorm.DB) {
			values, ok := tx.Statement.Dest.(map[string]interface{})
			if ok && tx.Statement.Table == "system_tasks" && values["state"] != nil {
				changedRows = tx.RowsAffected
			}
		}))
		t.Cleanup(func() { require.NoError(t, DB.Callback().Update().Remove(callback+":result")) })
		require.NoError(t, UpdateSystemTaskState(task.TaskID, "fixture-runner", state))
		if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
			assert.Zero(t, changedRows, "the real MySQL/MariaDB driver must exercise unchanged-row semantics")
		}
		require.ErrorIs(t, UpdateSystemTaskState(task.TaskID, "wrong-runner", state), ErrSystemTaskLockLost)
		require.NoError(t, DB.Model(&SystemTaskLock{}).Where("task_id = ?", task.TaskID).Update("locked_until", common.GetTimestamp()-1).Error)
		require.ErrorIs(t, UpdateSystemTaskState(task.TaskID, "fixture-runner", state), ErrSystemTaskLockLost)
	})
	// Use the same persisted user to prove multi-device credentials and unique
	// token identities still work after upgrading, rather than only inspecting indexes.
	verificationTx := DB.Begin()
	require.NoError(t, verificationTx.Error)
	t.Cleanup(func() { require.NoError(t, verificationTx.Rollback().Error) })
	require.NoError(t, verificationTx.Create(&PasskeyCredential{UserID: user.Id, CredentialID: "fixture-third-device", DisplayName: "第三设备", PublicKey: "fixture-public-key", CreatedAt: time.Unix(1789000000, 0)}).Error)
	assert.Error(t, verificationTx.Create(&Token{UserId: user.Id, Key: token.Key}).Error)
}
