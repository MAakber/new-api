package service

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAutoBanServiceTest(t *testing.T, config setting.AutoBanConfig) *model.User {
	t.Helper()
	previousDB := model.DB
	previousRedis := common.RedisEnabled
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.UserSession{}, &model.UserSecurityEvent{}, &model.UserAutoBanRecord{},
	))
	model.DB = db
	common.RedisEnabled = false
	autoBanLastCleanup.Store(0)
	encoded, err := common.Marshal(config)
	require.NoError(t, err)
	require.NoError(t, setting.UpdateAutoBanConfigByJSONString(string(encoded)))
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		autoBanLastCleanup.Store(0)
		defaults, marshalErr := common.Marshal(setting.DefaultAutoBanConfig())
		require.NoError(t, marshalErr)
		require.NoError(t, setting.UpdateAutoBanConfigByJSONString(string(defaults)))
	})
	user := &model.User{
		Username: "auto-ban-service-user", Password: "password", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1,
	}
	require.NoError(t, db.Create(user).Error)
	return user
}

func autoBanTestContext(userId int, userAgent string, ip string) *gin.Context {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	request := httptest.NewRequest("POST", "/v1/chat/completions", nil)
	request.RemoteAddr = ip + ":12345"
	request.Header.Set("User-Agent", userAgent)
	context.Request = request
	context.Set("id", userId)
	context.Set("token_id", 10)
	return context
}

func TestEvaluateAutoBanTriggerEnforcesRepeatedViolations(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.UserAgent.Enabled = true
	config.UserAgent.Mode = setting.AutoBanModeEnforce
	config.UserAgent.Threshold = 2
	config.UserAgent.ResponseStatus = 404
	config.UserAgent.ResponseCode = "not_found"
	config.UserAgent.ResponseMessage = "Not Found"
	user := setupAutoBanServiceTest(t, config)

	first, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "blocked", "203.0.113.5"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleUserAgent,
		Subject:  "blocked",
	})
	require.NoError(t, err)
	require.False(t, first.Banned)
	require.Equal(t, 1, first.Count)

	second, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "blocked", "203.0.113.5"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleUserAgent,
		Subject:  "blocked",
	})
	require.NoError(t, err)
	require.True(t, second.Banned)
	require.Equal(t, 2, second.Count)
	require.Equal(t, 404, second.Response.Status)
	require.Equal(t, "not_found", second.Response.Code)
	var record model.UserAutoBanRecord
	require.NoError(t, model.DB.First(&record, second.RecordId).Error)
	require.Equal(t, 2, record.TriggerCount)
}

func TestEvaluateAutoBanTriggerFormatsSensitiveWordViolationResponse(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.SensitiveWords.Enabled = true
	config.SensitiveWords.Mode = setting.AutoBanModeEnforce
	config.SensitiveWords.Threshold = 2
	config.SensitiveWordViolationResponse.Status = 422
	config.SensitiveWordViolationResponse.Code = "content_risk_control"
	config.SensitiveWordViolationResponse.Message = "Risk control ({count}/{threshold})"
	user := setupAutoBanServiceTest(t, config)

	decision, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "client", "203.0.113.7"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleSensitiveWords,
		Subject:  "sensitive_words",
	})
	require.NoError(t, err)
	require.True(t, decision.Evaluated)
	require.False(t, decision.Banned)
	require.Equal(t, 1, decision.Count)
	require.Equal(t, 422, decision.ViolationResponse.Status)
	require.Equal(t, "content_risk_control", decision.ViolationResponse.Code)
	require.Equal(t, "Risk control (1/2)", decision.ViolationResponse.Message)
}

func TestEvaluateAutoBanTriggerUsesSharedDatabaseForDistinctCounts(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.ModelProbing.Enabled = true
	config.ModelProbing.Mode = setting.AutoBanModeEnforce
	config.ModelProbing.Threshold = 2
	user := setupAutoBanServiceTest(t, config)

	first, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "client", "203.0.113.8"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleModelProbing,
		Subject:  "model-a",
		Distinct: true,
	})
	require.NoError(t, err)
	require.Equal(t, 1, first.Count)
	require.False(t, first.Banned)

	require.NoError(t, model.CreateUserSecurityEvent(&model.UserSecurityEvent{
		UserId: user.Id, RuleType: setting.AutoBanRuleModelProbing, Subject: "model-b", Evidence: "{}",
		CreatedAt: time.Now().Unix(),
	}))
	decision, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "client", "203.0.113.8"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleModelProbing,
		Subject:  "model-a",
		Distinct: true,
	})
	require.NoError(t, err)
	require.Equal(t, 2, decision.Count)
	require.True(t, decision.Banned)
}

func TestEvaluateAutoBanTriggerEnforcesDistinctThresholdUnderConcurrentRequests(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.ModelProbing.Enabled = true
	config.ModelProbing.Mode = setting.AutoBanModeEnforce
	config.ModelProbing.Threshold = 8
	user := setupAutoBanServiceTest(t, config)

	results := make(chan error, config.ModelProbing.Threshold)
	var group sync.WaitGroup
	for index := 0; index < config.ModelProbing.Threshold; index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			_, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "client", "203.0.113.9"), AutoBanTrigger{
				RuleType: setting.AutoBanRuleModelProbing,
				Subject:  fmt.Sprintf("model-%d", index),
				Distinct: true,
			})
			results <- err
		}(index)
	}
	group.Wait()
	close(results)
	for err := range results {
		require.NoError(t, err)
	}

	var stored model.User
	require.NoError(t, model.DB.First(&stored, user.Id).Error)
	_, banned := stored.ActiveAutoBan()
	require.True(t, banned)
	var activeRecords int64
	require.NoError(t, model.DB.Model(&model.UserAutoBanRecord{}).
		Where("user_id = ? AND status = ?", user.Id, model.AutoBanRecordStatusActive).
		Count(&activeRecords).Error)
	require.EqualValues(t, 1, activeRecords)
}

func TestEvaluateAutoBanTriggerEnforcesPermanentBan(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.UserAgent.Enabled = true
	config.UserAgent.Mode = setting.AutoBanModeEnforce
	config.UserAgent.Threshold = 1
	config.UserAgent.BanDurationMinutes = -1
	user := setupAutoBanServiceTest(t, config)

	decision, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "blocked", "203.0.113.5"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleUserAgent,
		Subject:  "blocked",
	})
	require.NoError(t, err)
	require.True(t, decision.Banned)
	require.Equal(t, int64(-1), decision.Response.Until)

	repeated, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "blocked", "203.0.113.5"), AutoBanTrigger{
		RuleType: setting.AutoBanRuleUserAgent,
		Subject:  "blocked",
	})
	require.NoError(t, err)
	require.True(t, repeated.Banned)
	require.Equal(t, decision.RecordId, repeated.RecordId)
}

func TestEvaluateAutoBanTriggerObservesDistinctModels(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.Enabled = true
	config.ModelProbing.Enabled = true
	config.ModelProbing.Mode = setting.AutoBanModeObserve
	config.ModelProbing.Threshold = 2
	user := setupAutoBanServiceTest(t, config)

	for index, modelName := range []string{"model-a", "model-b"} {
		decision, err := EvaluateAutoBanTrigger(autoBanTestContext(user.Id, "client", "203.0.113.6"), AutoBanTrigger{
			RuleType: setting.AutoBanRuleModelProbing,
			Subject:  modelName,
			Distinct: true,
			Evidence: map[string]interface{}{"model": modelName},
		})
		require.NoError(t, err)
		if index == 0 {
			require.False(t, decision.ThresholdReached)
		} else {
			require.True(t, decision.ThresholdReached)
			require.True(t, decision.Observed)
			require.False(t, decision.Banned)
		}
	}
}

func TestAutoBanEventRetentionCoversConfiguredWindows(t *testing.T) {
	config := setting.DefaultAutoBanConfig()
	config.ModelProbing.WindowMinutes = 90 * 24 * 60
	setupAutoBanServiceTest(t, config)

	require.GreaterOrEqual(t, autoBanEventRetentionSeconds(), int64(90*24*60*60))
}
