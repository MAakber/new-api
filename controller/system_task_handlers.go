package controller

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// RegisterScheduledSystemTasks wires the periodic channel test, upstream model
// update, and async task polling (Midjourney / Suno / video) jobs into the
// system task framework so a DB lease dedups execution across multiple master
// instances and each run is recorded as one task row. Call this before
// service.StartSystemTaskRunner.
func RegisterScheduledSystemTasks() {
	service.RegisterSystemTaskHandler(channelTestHandler{})
	service.RegisterSystemTaskHandler(modelUpdateHandler{})
	service.RegisterSystemTaskHandler(midjourneyPollHandler{})
	service.RegisterSystemTaskHandler(asyncTaskPollHandler{})
	service.RegisterSystemTaskHandler(autoPriceSyncHandler{})
	service.RegisterSystemTaskHandler(autoModelMetadataSyncHandler{})
	service.RegisterSystemTaskHandler(channelQueueWarmupHandler{})
	service.RegisterSystemTaskHandler(channelCustomBalanceTaskHandler{
		taskType:  model.SystemTaskTypeChannelCustomBalance,
		operation: model.ChannelCustomBalanceOperationBalance,
	})
	service.RegisterSystemTaskHandler(channelCustomBalanceTaskHandler{
		taskType:  model.SystemTaskTypeChannelCustomCheckin,
		operation: model.ChannelCustomBalanceOperationCheckin,
	})
}

type channelCustomBalanceTaskHandler struct {
	taskType  string
	operation string
}

func (handler channelCustomBalanceTaskHandler) Type() string { return handler.taskType }

func (handler channelCustomBalanceTaskHandler) BuildDueTask(now int64) (*model.SystemTask, bool, error) {
	return service.BuildDueChannelCustomBalanceTask(handler.taskType, now)
}

func (handler channelCustomBalanceTaskHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary, err := service.RunDueChannelCustomBalanceTask(ctx, handler.operation)
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, summary, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

type channelQueueWarmupHandler struct{}

func (channelQueueWarmupHandler) Type() string { return model.SystemTaskTypeChannelQueueWarmup }

func (channelQueueWarmupHandler) BuildDueTask(now int64) (*model.SystemTask, bool, error) {
	return buildDueChannelQueueWarmupTask(now)
}

func (channelQueueWarmupHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := channelQueueWarmupTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	result, err := runChannelQueueWarmupRound(ctx, payload.ChannelIDs, service.NewSystemTaskProgressReporter(task, runnerID))
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return
		}
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, result, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, result, nil)
}

// channelTestHandler runs the scheduled "test all channels" job. Enablement and
// cadence still come from the monitor settings; only the execution path moved
// into the system task runner.
type channelTestHandler struct{}

func (channelTestHandler) Type() string { return model.SystemTaskTypeChannelTest }

func (channelTestHandler) Enabled() bool {
	return operation_setting.GetMonitorSetting().AutoTestChannelEnabled
}

func (channelTestHandler) Interval() time.Duration {
	minutes := operation_setting.GetMonitorSetting().AutoTestChannelMinutes
	if minutes <= 0 {
		minutes = 10
	}
	return time.Duration(minutes * float64(time.Minute))
}

func (channelTestHandler) NewPayload() any { return nil }

// channelTestTaskPayload controls one channel_test run. A nil/empty payload is a
// scheduled run, which uses the configured monitor ChannelTestMode and does not
// notify. A manual "test all channels" trigger sets Mode=scheduled_all and
// Notify=true to reproduce the legacy manual behavior (test every channel and
// notify root on completion).
type channelTestTaskPayload struct {
	Mode   string `json:"mode,omitempty"`
	Notify bool   `json:"notify,omitempty"`
}

func (channelTestHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := channelTestTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	summary, err := runChannelTestTask(ctx, payload.Mode, payload.Notify, service.NewSystemTaskProgressReporter(task, runnerID))
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// modelUpdateHandler runs the scheduled upstream model update detection job.
type modelUpdateHandler struct{}

func (modelUpdateHandler) Type() string { return model.SystemTaskTypeModelUpdate }

func (modelUpdateHandler) Enabled() bool {
	return common.GetEnvOrDefaultBool("CHANNEL_UPSTREAM_MODEL_UPDATE_TASK_ENABLED", true)
}

func (modelUpdateHandler) Interval() time.Duration {
	intervalMinutes := common.GetEnvOrDefault(
		"CHANNEL_UPSTREAM_MODEL_UPDATE_TASK_INTERVAL_MINUTES",
		channelUpstreamModelUpdateTaskDefaultIntervalMinutes,
	)
	if intervalMinutes < 1 {
		intervalMinutes = channelUpstreamModelUpdateTaskDefaultIntervalMinutes
	}
	return time.Duration(intervalMinutes) * time.Minute
}

func (modelUpdateHandler) NewPayload() any { return nil }

// modelUpdateTaskPayload controls one model_update run. A scheduled run
// (Manual=false) respects the per-channel minimum check interval and may
// auto-apply detected models when a channel has auto-sync enabled. A manual
// "detect all" trigger sets Manual=true to reproduce the legacy detect-all
// semantics: force a re-check regardless of the interval and never auto-apply,
// so the admin reviews and applies changes explicitly.
type modelUpdateTaskPayload struct {
	Manual bool `json:"manual,omitempty"`
}

func (modelUpdateHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := modelUpdateTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	summary := runChannelUpstreamModelUpdateTaskOnce(ctx, payload.Manual, !payload.Manual, service.NewSystemTaskProgressReporter(task, runnerID))
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// midjourneyPollHandler runs one Midjourney polling pass per scheduled run.
// Enabled() folds the "are there unfinished tasks?" check into enablement so the
// scheduler creates no row when the system is idle; only when at least one
// Midjourney task is in progress does a row get scheduled.
type midjourneyPollHandler struct{}

func (midjourneyPollHandler) Type() string { return model.SystemTaskTypeMidjourneyPoll }

func (midjourneyPollHandler) Enabled() bool {
	return constant.UpdateTask && model.HasUnfinishedMidjourneyTasks()
}

func (midjourneyPollHandler) Interval() time.Duration { return 15 * time.Second }

func (midjourneyPollHandler) NewPayload() any { return nil }

func (midjourneyPollHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary := runMidjourneyTaskUpdateOnce(ctx, service.NewSystemTaskProgressReporter(task, runnerID))
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

// asyncTaskPollHandler runs one async-task (Suno/video) polling pass per
// scheduled run. Like midjourneyPollHandler, Enabled() folds in the unfinished
// task existence check so an idle system schedules no rows.
type asyncTaskPollHandler struct{}

func (asyncTaskPollHandler) Type() string { return model.SystemTaskTypeAsyncTaskPoll }

func (asyncTaskPollHandler) Enabled() bool {
	return constant.UpdateTask && model.HasUnfinishedSyncTasks()
}

func (asyncTaskPollHandler) Interval() time.Duration { return 15 * time.Second }

func (asyncTaskPollHandler) NewPayload() any { return nil }

func (asyncTaskPollHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	summary := service.RunTaskPollingOnce(ctx, service.NewSystemTaskProgressReporter(task, runnerID))
	finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusSucceeded, summary, nil)
}

type autoPriceSyncHandler struct{}

func (autoPriceSyncHandler) Type() string { return model.SystemTaskTypeAutoPriceSync }
func (autoPriceSyncHandler) BuildDueTask(now int64) (*model.SystemTask, bool, error) {
	return buildDueAutoSyncTask(model.SystemTaskTypeAutoPriceSync, now)
}
func (autoPriceSyncHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := model.AutoSyncTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil || payload.EventType != task.Type || payload.CutoffGeneration <= 0 {
		common.SysLog(fmt.Sprintf("auto price sync task has invalid payload: task=%s", task.TaskID))
		return
	}
	outcome, err := service.RunAutoPriceSyncBatch(ctx, payload.CutoffGeneration)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			common.SysLog(fmt.Sprintf("auto price sync task interrupted: task=%s err=%v", task.TaskID, err))
		}
		return
	}
	status := model.SystemTaskStatusSucceeded
	if outcome.Failed {
		status = model.SystemTaskStatusFailed
	}
	finishAutoSyncTask(task, runnerID, payload, outcome.EventIDs, status, outcome.Summary, strings.Join(outcome.Summary.Errors, "; "))
}

type autoModelMetadataSyncHandler struct{}

func (autoModelMetadataSyncHandler) Type() string { return model.SystemTaskTypeAutoModelSync }
func (autoModelMetadataSyncHandler) BuildDueTask(now int64) (*model.SystemTask, bool, error) {
	return buildDueAutoSyncTask(model.SystemTaskTypeAutoModelSync, now)
}
func (autoModelMetadataSyncHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	payload := model.AutoSyncTaskPayload{}
	if err := task.DecodePayload(&payload); err != nil || payload.EventType != task.Type || payload.CutoffGeneration <= 0 {
		common.SysLog(fmt.Sprintf("auto model sync task has invalid payload: task=%s", task.TaskID))
		return
	}
	outcome, err := service.RunAutoModelMetadataSyncBatch(ctx, payload.CutoffGeneration)
	if err != nil {
		if !errors.Is(err, context.Canceled) {
			common.SysLog(fmt.Sprintf("auto model sync task interrupted: task=%s err=%v", task.TaskID, err))
		}
		return
	}
	status := model.SystemTaskStatusSucceeded
	if outcome.Failed {
		status = model.SystemTaskStatusFailed
	}
	finishAutoSyncTask(task, runnerID, payload, outcome.EventIDs, status, outcome.Summary, strings.Join(outcome.Summary.Errors, "; "))
}

func buildDueAutoSyncTask(eventType string, now int64) (*model.SystemTask, bool, error) {
	var task *model.SystemTask
	built := false
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var err error
		task, built, err = model.BuildDueAutoSyncTaskTx(tx, eventType, now)
		return err
	})
	return task, built, err
}

func finishAutoSyncTask(task *model.SystemTask, runnerID string, payload model.AutoSyncTaskPayload, eventIDs []int64, status model.SystemTaskStatus, result any, errorMessage string) {
	if len(errorMessage) > 512 {
		errorMessage = errorMessage[:512]
	}
	err := model.DB.Transaction(func(tx *gorm.DB) error {
		if err := model.FinalizeAutoSyncBatchTx(tx, payload.EventType, payload.CutoffGeneration, eventIDs, task.TaskID); err != nil {
			return err
		}
		return model.FinishSystemTaskTx(tx, task.TaskID, runnerID, status, result, errorMessage)
	})
	if err != nil {
		common.SysLog(fmt.Sprintf("auto sync task failed to finalize atomically: task=%s err=%v", task.TaskID, err))
		return
	}
	if err := model.ReleaseSystemTaskLock(task.TaskID, runnerID); err != nil {
		common.SysLog(fmt.Sprintf("auto sync task failed to release lock: task=%s err=%v", task.TaskID, err))
	}
}

func finishSystemTaskHandler(task *model.SystemTask, runnerID string, status model.SystemTaskStatus, result any, runErr error) {
	errorMessage := ""
	if runErr != nil {
		errorMessage = runErr.Error()
	}
	if err := model.FinishSystemTask(task.TaskID, runnerID, status, result, errorMessage); err != nil {
		common.SysLog(fmt.Sprintf("system task %s failed to persist result: %v", task.TaskID, err))
	}
}
