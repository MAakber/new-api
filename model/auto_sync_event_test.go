package model

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func prepareAutoSyncEventTables(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&AutoSyncCursor{}, &AutoSyncEvent{}))
	t.Cleanup(func() {
		DB.Exec("DELETE FROM channel_auto_sync_events")
		DB.Exec("DELETE FROM channel_auto_sync_cursors")
	})
}

func TestAppendAutoSyncEventTxRollback(t *testing.T) {
	prepareAutoSyncEventTables(t)
	tx := DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, &AutoSyncEvent{Type: "price", ChannelID: 1, Trigger: "create", EventAt: 100}))
	require.NoError(t, tx.Rollback().Error)

	var cursorCount, eventCount int64
	require.NoError(t, DB.Model(&AutoSyncCursor{}).Count(&cursorCount).Error)
	require.NoError(t, DB.Model(&AutoSyncEvent{}).Count(&eventCount).Error)
	assert.Zero(t, cursorCount)
	assert.Zero(t, eventCount)
}

func TestAppendAutoSyncEventTxConcurrentGenerations(t *testing.T) {
	prepareAutoSyncEventTables(t)
	const producers = 12
	var wg sync.WaitGroup
	errs := make(chan error, producers)
	for i := 0; i < producers; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tx := DB.Begin()
			if tx.Error != nil {
				errs <- tx.Error
				return
			}
			if err := AppendAutoSyncEventTx(tx, &AutoSyncEvent{Type: "metadata", ChannelID: i + 1, Trigger: "create", EventAt: int64(100 + i)}); err != nil {
				_ = tx.Rollback().Error
				errs <- err
				return
			}
			errs <- tx.Commit().Error
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}

	var events []AutoSyncEvent
	require.NoError(t, DB.Where("type = ?", "metadata").Order("generation asc").Find(&events).Error)
	require.Len(t, events, producers)
	for i, event := range events {
		assert.EqualValues(t, i+1, event.Generation)
	}
}

func TestAppendAutoSyncEventTxLateOldEventDoesNotMoveDueBackward(t *testing.T) {
	prepareAutoSyncEventTables(t)
	first := &AutoSyncEvent{Type: "price", ChannelID: 1, Trigger: "create", EventAt: 100}
	tx := DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, first))
	require.NoError(t, tx.Commit().Error)

	lateOld := &AutoSyncEvent{Type: "price", ChannelID: 2, Trigger: "update", EventAt: 90}
	tx = DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, lateOld))
	require.NoError(t, tx.Commit().Error)

	var cursor AutoSyncCursor
	require.NoError(t, DB.Where("type = ?", "price").First(&cursor).Error)
	assert.EqualValues(t, 2, cursor.Generation)
	assert.EqualValues(t, 105, cursor.DueAt)
}

func TestFreezeDueAutoSyncBatchTxDoesNotAbsorbSuccessor(t *testing.T) {
	prepareAutoSyncEventTables(t)
	tx := DB.Begin()
	first := &AutoSyncEvent{Type: "price", ChannelID: 1, Trigger: "create", EventAt: 100}
	require.NoError(t, AppendAutoSyncEventTx(tx, first))
	require.NoError(t, tx.Commit().Error)

	tx = DB.Begin()
	cutoff, due, err := FreezeDueAutoSyncBatchTx(tx, "price", 105)
	require.NoError(t, err)
	require.True(t, due)
	require.Equal(t, first.Generation, cutoff)
	require.NoError(t, tx.Commit().Error)

	tx = DB.Begin()
	second := &AutoSyncEvent{Type: "price", ChannelID: 2, Trigger: "update", EventAt: 106}
	require.NoError(t, AppendAutoSyncEventTx(tx, second))
	require.NoError(t, tx.Commit().Error)

	events, err := ListPendingAutoSyncEvents("price", cutoff)
	require.NoError(t, err)
	require.Len(t, events, 1)
	assert.Equal(t, first.ID, events[0].ID)
	assert.Greater(t, second.Generation, cutoff)
}

func TestBuildDueAutoSyncTaskTxRollsBackAtomically(t *testing.T) {
	prepareAutoSyncEventTables(t)
	tx := DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, &AutoSyncEvent{Type: "auto_price_task", ChannelID: 1, Trigger: "create", EventAt: 100}))
	require.NoError(t, tx.Commit().Error)

	tx = DB.Begin()
	task, built, err := BuildDueAutoSyncTaskTx(tx, "auto_price_task", 105)
	require.NoError(t, err)
	require.True(t, built)
	require.NotNil(t, task)
	var payload AutoSyncTaskPayload
	require.NoError(t, task.DecodePayload(&payload))
	assert.Equal(t, "auto_price_task", payload.EventType)
	assert.EqualValues(t, 1, payload.CutoffGeneration)
	require.NoError(t, tx.Rollback().Error)

	var taskCount int64
	require.NoError(t, DB.Model(&SystemTask{}).Where("type = ?", "auto_price_task").Count(&taskCount).Error)
	assert.Zero(t, taskCount)
}

func TestBuildDueAutoSyncTaskTxSkipsEmptyBatchAndClearsDue(t *testing.T) {
	prepareAutoSyncEventTables(t)
	event := &AutoSyncEvent{Type: "empty", ChannelID: 1, Trigger: "create", EventAt: 100}
	tx := DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, event))
	require.NoError(t, tx.Commit().Error)
	now := int64(101)
	require.NoError(t, DB.Model(&AutoSyncEvent{}).Where("id = ?", event.ID).Update("processed_at", now).Error)

	tx = DB.Begin()
	task, built, err := BuildDueAutoSyncTaskTx(tx, "empty", 105)
	require.NoError(t, err)
	assert.False(t, built)
	assert.Nil(t, task)
	require.NoError(t, tx.Commit().Error)

	var cursor AutoSyncCursor
	require.NoError(t, DB.Where("type = ?", "empty").First(&cursor).Error)
	assert.Zero(t, cursor.DueAt)
}

func TestFinalizeAutoSyncBatchTxPreservesSuccessorDue(t *testing.T) {
	prepareAutoSyncEventTables(t)
	first := &AutoSyncEvent{Type: "finalize", ChannelID: 1, Trigger: "create", EventAt: 100}
	tx := DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, first))
	require.NoError(t, tx.Commit().Error)
	second := &AutoSyncEvent{Type: "finalize", ChannelID: 2, Trigger: "update", EventAt: 106}
	tx = DB.Begin()
	require.NoError(t, AppendAutoSyncEventTx(tx, second))
	require.NoError(t, tx.Commit().Error)

	tx = DB.Begin()
	require.NoError(t, FinalizeAutoSyncBatchTx(tx, "finalize", first.Generation, []int64{first.ID}, "task-1"))
	require.NoError(t, tx.Commit().Error)
	var cursor AutoSyncCursor
	require.NoError(t, DB.Where("type = ?", "finalize").First(&cursor).Error)
	assert.EqualValues(t, 111, cursor.DueAt)

	var reloaded AutoSyncEvent
	require.NoError(t, DB.First(&reloaded, first.ID).Error)
	assert.NotNil(t, reloaded.ProcessedAt)
	assert.Equal(t, "task-1", reloaded.TaskID)
}
