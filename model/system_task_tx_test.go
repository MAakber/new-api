package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateSystemTaskTxRollbackAndActiveKey(t *testing.T) {
	truncateTables(t)

	tx := DB.Begin()
	require.NoError(t, tx.Error)
	task, err := CreateSystemTaskTx(tx, "tx_task", map[string]string{"a": "b"}, nil)
	require.NoError(t, err)
	assert.Equal(t, "tx_task", *task.ActiveKey)
	require.NoError(t, tx.Rollback().Error)

	var count int64
	require.NoError(t, DB.Model(&SystemTask{}).Where("task_id = ?", task.TaskID).Count(&count).Error)
	assert.Zero(t, count)

	first, err := CreateSystemTask("tx_task", nil, nil)
	require.NoError(t, err)
	assert.Equal(t, "tx_task", *first.ActiveKey)
	_, err = CreateSystemTask("tx_task", nil, nil)
	require.Error(t, err)
}

func TestFinishSystemTaskTxRollsBackWithCallerTransaction(t *testing.T) {
	truncateTables(t)
	task, err := CreateSystemTask("tx_finish_task", nil, nil)
	require.NoError(t, err)
	_, claimed, err := ClaimSystemTask(task.ID, task.Type, "runner-tx", common.GetTimestamp()+60)
	require.NoError(t, err)
	require.True(t, claimed)

	tx := DB.Begin()
	require.NoError(t, tx.Error)
	require.NoError(t, FinishSystemTaskTx(tx, task.TaskID, "runner-tx", SystemTaskStatusSucceeded, map[string]bool{"done": true}, ""))
	require.NoError(t, tx.Rollback().Error)
	reloaded, err := GetSystemTaskByTaskID(task.TaskID)
	require.NoError(t, err)
	require.Equal(t, SystemTaskStatusRunning, reloaded.Status)

	require.NoError(t, FinishSystemTask(task.TaskID, "runner-tx", SystemTaskStatusSucceeded, nil, ""))
}
