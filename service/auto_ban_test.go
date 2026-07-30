package service

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

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
	autoBanSubjectTrackers = sync.Map{}
	autoBanLastCleanup.Store(0)
	encoded, err := json.Marshal(config)
	require.NoError(t, err)
	require.NoError(t, setting.UpdateAutoBanConfigByJSONString(string(encoded)))
	t.Cleanup(func() {
		model.DB = previousDB
		common.RedisEnabled = previousRedis
		autoBanSubjectTrackers = sync.Map{}
		autoBanLastCleanup.Store(0)
		defaults, marshalErr := json.Marshal(setting.DefaultAutoBanConfig())
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
