package controller

import (
	"os"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogStatisticsDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("set " + dialect.env + " to run this database")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.Log{}))
			now := time.Now().Unix()
			logs := []model.Log{
				{Type: model.LogTypeConsume, Username: "stat-owner", ModelName: "stat-model", TokenName: "stat-key", Group: "default", CreatedAt: now - 3600, Quota: 1001, PromptTokens: 5, CompletionTokens: 3},
				{Type: model.LogTypeConsume, Username: "stat-owner", ModelName: "stat-model", TokenName: "stat-key", Group: "default", CreatedAt: now, Quota: 37, PromptTokens: 11, CompletionTokens: 3},
				{Type: model.LogTypeConsume, Username: "other-owner", ModelName: "stat-model", TokenName: "stat-key", Group: "default", CreatedAt: now, Quota: 999, PromptTokens: 100, CompletionTokens: 100},
			}
			require.NoError(t, db.Create(&logs).Error)
			for _, test := range []struct {
				name     string
				end      int64
				username string
				want     model.Stat
			}{
				{"quota_survives_rate_scan", now + 1, "stat-owner", model.Stat{Quota: 1038, Rpm: 1, Tpm: 14}},
				{"historical_quota_keeps_current_rates", now - 120, "stat-owner", model.Stat{Quota: 1001, Rpm: 1, Tpm: 14}},
				{"no_matching_owner", now + 1, "absent-owner", model.Stat{}},
			} {
				t.Run(test.name, func(t *testing.T) {
					stat, err := model.SumUsedQuota(model.LogTypeConsume, now-7200, test.end, "stat-model", test.username, "stat-key", 0, "default")
					require.NoError(t, err)
					assert.Equal(t, test.want, stat)
				})
			}
		})
	}
}
