package perfmetrics

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSummaryKeepsLegacySamplesAlongsideHourlySeriesAndFiltersGroups(t *testing.T) {
	previousDB := model.DB
	previousMain, previousLog := common.MainDatabaseType(), common.LogDatabaseType()
	previousPath, previousMaster := common.SQLitePath, common.IsMasterNode
	previousBuckets := map[bucketKey]*atomicBucket{}
	hotBuckets.Range(func(key, value any) bool {
		previousBuckets[key.(bucketKey)] = value.(*atomicBucket)
		return true
	})
	hotBuckets.Clear()
	t.Cleanup(func() {
		model.DB = previousDB
		common.SQLitePath, common.IsMasterNode = previousPath, previousMaster
		common.SetDatabaseTypes(previousMain, previousLog)
		hotBuckets.Clear()
		for key, value := range previousBuckets {
			hotBuckets.Store(key, value)
		}
	})
	t.Setenv("SQL_DSN", "")
	t.Setenv("LOG_SQL_DSN", "")
	common.SQLitePath = filepath.Join(t.TempDir(), "metrics.db")
	common.IsMasterNode = false
	require.NoError(t, model.InitDB())
	db := model.DB
	connection, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, connection.Close()) })
	require.NoError(t, db.AutoMigrate(&model.PerfMetric{}))
	hour := time.Now().Unix() / 3600 * 3600
	rows := []model.PerfMetric{
		{ModelName: "public-model", Group: "public", BucketTs: hour - 3*3600, RequestCount: 5, SuccessCount: 5},
		{ModelName: "public-model", Group: "public", BucketTs: hour - 2*3600, RequestCount: 3, SuccessCount: 1},
		{ModelName: "public-model", Group: "public", BucketTs: hour - 2*3600 + 1800, RequestCount: 1, SuccessCount: 1},
		{ModelName: "public-model", Group: "public", BucketTs: hour - 3600, RequestCount: 2, SuccessCount: 0},
		{ModelName: "public-model", Group: "private", BucketTs: hour - 3600, RequestCount: 100, SuccessCount: 100},
		{ModelName: "private-model", Group: "private", BucketTs: hour - 3600, RequestCount: 100, SuccessCount: 100},
	}
	require.NoError(t, db.Create(&rows).Error)
	hot := &atomicBucket{}
	hot.add(Sample{Success: true})
	hotBuckets.Store(bucketKey{model: "public-model", group: "public", bucketTs: hour - 2*3600 + 1800}, hot)
	hotBuckets.Store(bucketKey{model: "private-model", group: "private", bucketTs: hour - 3600}, hot)

	result, err := QuerySummaryAll(24, []string{"public"})
	require.NoError(t, err)
	require.Len(t, result.Models, 1)
	assert.Equal(t, "public-model", result.Models[0].ModelName)
	assert.Equal(t, int64(12), result.Models[0].RequestCount)
	assert.Equal(t, 66.67, result.Models[0].SuccessRate)
	assert.Equal(t, []float64{33.33, 100, 0}, result.Models[0].RecentSuccessRates)
	encoded, err := common.Marshal(result)
	require.NoError(t, err)
	var response struct {
		Models []struct {
			RecentSuccessRates  []float64 `json:"recent_success_rates"`
			RecentSuccessSeries []struct {
				Ts          int64   `json:"ts"`
				SuccessRate float64 `json:"success_rate"`
			} `json:"recent_success_series"`
		} `json:"models"`
	}
	require.NoError(t, common.Unmarshal(encoded, &response))
	require.Len(t, response.Models, 1)
	assert.Equal(t, []float64{33.33, 100, 0}, response.Models[0].RecentSuccessRates)
	series := response.Models[0].RecentSuccessSeries
	require.Len(t, series, 3)
	assert.Equal(t, []int64{hour - 3*3600, hour - 2*3600, hour - 3600}, []int64{series[0].Ts, series[1].Ts, series[2].Ts})
	assert.Equal(t, []float64{100, 60, 0}, []float64{series[0].SuccessRate, series[1].SuccessRate, series[2].SuccessRate})

	empty, err := QuerySummaryAll(24, []string{})
	require.NoError(t, err)
	assert.Empty(t, empty.Models, "an explicitly empty visibility set must not expose database or unflushed samples")
}
