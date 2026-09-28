package perfmetrics

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestQueryAvailabilitySummaryUsesFullPeriodTotalsAndRecentTrend(t *testing.T) {
	previousDB := model.DB
	type storedBucket struct {
		key   any
		value any
	}
	previousHotBuckets := make([]storedBucket, 0)
	hotBuckets.Range(func(key, value any) bool {
		previousHotBuckets = append(previousHotBuckets, storedBucket{key: key, value: value})
		hotBuckets.Delete(key)
		return true
	})
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.PerfMetric{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
		hotBuckets.Range(func(key, _ any) bool {
			hotBuckets.Delete(key)
			return true
		})
		for _, bucket := range previousHotBuckets {
			hotBuckets.Store(bucket.key, bucket.value)
		}
	})

	currentBucket := bucketStart(time.Now().Unix())
	metrics := []model.PerfMetric{
		{
			ModelName:      "test-model",
			Group:          "default",
			BucketTs:       currentBucket - 48*3600,
			RequestCount:   10,
			SuccessCount:   5,
			TotalLatencyMs: 1000,
		},
		{
			ModelName:      "test-model",
			Group:          "default",
			BucketTs:       currentBucket - 3600,
			RequestCount:   10,
			SuccessCount:   10,
			TotalLatencyMs: 2000,
		},
	}
	require.NoError(t, db.Create(&metrics).Error)

	result, err := QueryAvailabilitySummary(7*24, nil)
	require.NoError(t, err)
	require.Len(t, result.Models, 1)
	assert.Equal(t, int64(20), result.Models[0].RequestCount)
	assert.Equal(t, 75.0, result.Models[0].SuccessRate)
	assert.Equal(t, int64(150), result.Models[0].AvgLatencyMs)
	assert.Equal(t, []float64{100}, result.Models[0].RecentSuccessRates)
}

func TestRecentSuccessRatesWithoutRecentBucketsReturnsEmptyArray(t *testing.T) {
	rates := recentSuccessRates(nil, 12)

	require.NotNil(t, rates)
	assert.Equal(t, []float64{}, rates)
}

// Terminal task sampling: success/failure counts, end-to-end latency, and
// token throughput only for successful tasks that report tokens.
func TestRecordTaskResultSamplesTerminalTasks(t *testing.T) {
	hotBuckets.Clear()
	t.Cleanup(func() { hotBuckets.Clear() })
	now := time.Now().Unix()
	RecordTaskResult(&model.Task{
		Status:     model.TaskStatusSuccess,
		Group:      "a",
		SubmitTime: now - 120,
		StartTime:  now - 100,
		FinishTime: now,
		Properties: model.Properties{OriginModelName: "video-model"},
	}, &relaycommon.TaskInfo{TotalTokens: 5000})
	RecordTaskResult(&model.Task{
		Status:     model.TaskStatusFailure,
		Group:      "a",
		SubmitTime: now - 60,
		FinishTime: now,
		Properties: model.Properties{OriginModelName: "video-model"},
	}, relaycommon.FailTaskInfo("boom"))
	RecordTaskResult(&model.Task{Status: model.TaskStatusSuccess, FinishTime: now}, nil)

	merged := map[bucketKey]counters{}
	hotBuckets.Range(func(key, value any) bool {
		k := key.(bucketKey)
		require.Equal(t, "video-model", k.model)
		require.Equal(t, "a", k.group)
		k.bucketTs = 0
		mergeCounters(merged, k, value.(*atomicBucket).snapshot())
		return true
	})
	assert.Equal(t, counters{
		requestCount:   2,
		successCount:   1,
		totalLatencyMs: 180000,
		outputTokens:   5000,
		generationMs:   100000,
	}, merged[bucketKey{model: "video-model", group: "a"}])
}
