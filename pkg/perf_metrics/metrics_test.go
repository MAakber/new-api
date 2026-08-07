package perfmetrics

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"

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
