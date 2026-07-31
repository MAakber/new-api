package model

import (
	"errors"
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const autoSyncDebounceSeconds int64 = 5

// AutoSyncTaskPayload is the complete, non-secret scheduler payload for a
// frozen event batch.
type AutoSyncTaskPayload struct {
	EventType        string `json:"event_type"`
	CutoffGeneration int64  `json:"cutoff_generation"`
}

// AutoSyncCursor is the per-sync-type durable debounce cursor. Generation is
// advanced with every event, allowing a scheduler to freeze a precise batch.
type AutoSyncCursor struct {
	Type       string `json:"type" gorm:"type:varchar(64);primaryKey"`
	Generation int64  `json:"generation" gorm:"not null"`
	DueAt      int64  `json:"due_at" gorm:"bigint;index;not null"`
	UpdatedAt  int64  `json:"updated_at" gorm:"bigint;not null"`
}

func (AutoSyncCursor) TableName() string {
	return "channel_auto_sync_cursors"
}

// AutoSyncEvent contains only scheduler metadata; callers must not persist
// channel secrets in Payload.
type AutoSyncEvent struct {
	ID          int64  `json:"id" gorm:"primaryKey"`
	Type        string `json:"type" gorm:"type:varchar(64);index;not null"`
	Generation  int64  `json:"generation" gorm:"index;not null"`
	ChannelID   int    `json:"channel_id" gorm:"index;not null"`
	Trigger     string `json:"trigger" gorm:"type:varchar(64);not null"`
	Payload     string `json:"payload" gorm:"type:text"`
	State       string `json:"state" gorm:"type:text"`
	TaskID      string `json:"task_id" gorm:"type:varchar(64);index"`
	EventAt     int64  `json:"event_at" gorm:"bigint;index;not null"`
	ProcessedAt *int64 `json:"processed_at" gorm:"bigint;index"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index;not null"`
}

func (AutoSyncEvent) TableName() string {
	return "channel_auto_sync_events"
}

// The mutex avoids avoidable SQLITE_BUSY failures for concurrent producers in
// this process. The generation compare-and-swap remains the correctness
// mechanism across processes and other database dialects.
var autoSyncCursorLocks sync.Map

func autoSyncCursorLock(eventType string) *sync.Mutex {
	lock, _ := autoSyncCursorLocks.LoadOrStore(eventType, &sync.Mutex{})
	return lock.(*sync.Mutex)
}

// AppendAutoSyncEventTx increments the cursor and inserts its event in the
// same transaction. EventAt defaults to the current timestamp when omitted.
func AppendAutoSyncEventTx(tx *gorm.DB, event *AutoSyncEvent) error {
	if tx == nil {
		return errors.New("auto sync transaction is nil")
	}
	if event == nil || event.Type == "" {
		return errors.New("auto sync event type is required")
	}
	if event.EventAt == 0 {
		event.EventAt = common.GetTimestamp()
	}
	if event.CreatedAt == 0 {
		event.CreatedAt = event.EventAt
	}

	lock := autoSyncCursorLock(event.Type)
	lock.Lock()
	defer lock.Unlock()

	for attempts := 0; attempts < 8; attempts++ {
		var cursor AutoSyncCursor
		err := lockForUpdate(tx).Where("type = ?", event.Type).First(&cursor).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			cursor = AutoSyncCursor{Type: event.Type, Generation: 1, DueAt: event.EventAt + autoSyncDebounceSeconds, UpdatedAt: event.EventAt}
			result := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&cursor)
			if result.Error != nil {
				return result.Error
			}
			if result.RowsAffected == 0 {
				continue // conflict was safely ignored; retry in this transaction
			}
			event.Generation = cursor.Generation
			return tx.Create(event).Error
		}
		if err != nil {
			return err
		}

		nextGeneration := cursor.Generation + 1
		proposedDueAt := event.EventAt + autoSyncDebounceSeconds
		result := tx.Model(&AutoSyncCursor{}).
			Where("type = ? AND generation = ?", event.Type, cursor.Generation).
			Updates(map[string]any{
				"generation": nextGeneration,
				"due_at":     gorm.Expr("CASE WHEN due_at > ? THEN due_at ELSE ? END", proposedDueAt, proposedDueAt),
				"updated_at": gorm.Expr("CASE WHEN updated_at > ? THEN updated_at ELSE ? END", event.EventAt, event.EventAt),
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			continue
		}
		event.Generation = nextGeneration
		return tx.Create(event).Error
	}
	return fmt.Errorf("auto sync cursor CAS retry limit reached for type %q", event.Type)
}

// FreezeDueAutoSyncBatchTx freezes the current generation if its quiet window
// has elapsed. Producers must advance the same cursor before inserting, so a
// later event receives a generation greater than this cutoff.
func FreezeDueAutoSyncBatchTx(tx *gorm.DB, eventType string, now int64) (int64, bool, error) {
	if tx == nil {
		return 0, false, errors.New("auto sync transaction is nil")
	}
	lock := autoSyncCursorLock(eventType)
	lock.Lock()
	defer lock.Unlock()
	return freezeDueAutoSyncBatchTx(tx, eventType, now)
}

func freezeDueAutoSyncBatchTx(tx *gorm.DB, eventType string, now int64) (int64, bool, error) {
	var cursor AutoSyncCursor
	err := lockForUpdate(tx).Where("type = ?", eventType).First(&cursor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	if cursor.DueAt > now {
		return 0, false, nil
	}
	return cursor.Generation, true, nil
}

// BuildDueAutoSyncTaskTx atomically freezes a due batch and creates its normal
// singleton SystemTask. A cursor with no pending events is cleared instead of
// producing an empty task.
func BuildDueAutoSyncTaskTx(tx *gorm.DB, eventType string, now int64) (*SystemTask, bool, error) {
	if tx == nil {
		return nil, false, errors.New("auto sync transaction is nil")
	}
	lock := autoSyncCursorLock(eventType)
	lock.Lock()
	defer lock.Unlock()

	cutoff, due, err := freezeDueAutoSyncBatchTx(tx, eventType, now)
	if err != nil || !due {
		return nil, false, err
	}
	var pendingCount int64
	if err := tx.Model(&AutoSyncEvent{}).
		Where("type = ? AND generation <= ? AND processed_at IS NULL", eventType, cutoff).
		Count(&pendingCount).Error; err != nil {
		return nil, false, err
	}
	if pendingCount == 0 {
		result := tx.Model(&AutoSyncCursor{}).Where("type = ? AND generation = ?", eventType, cutoff).
			Update("due_at", 0)
		return nil, false, result.Error
	}
	task, err := CreateSystemTaskTx(tx, eventType, AutoSyncTaskPayload{EventType: eventType, CutoffGeneration: cutoff}, nil)
	if err != nil {
		return nil, false, err
	}
	return task, true, nil
}

func ListPendingAutoSyncEventsTx(tx *gorm.DB, eventType string, cutoffGeneration int64) ([]*AutoSyncEvent, error) {
	if tx == nil {
		return nil, errors.New("auto sync transaction is nil")
	}
	var events []*AutoSyncEvent
	err := tx.Where("type = ? AND generation <= ? AND processed_at IS NULL", eventType, cutoffGeneration).
		Order("generation asc, id asc").Find(&events).Error
	return events, err
}

func ListPendingAutoSyncEvents(eventType string, cutoffGeneration int64) ([]*AutoSyncEvent, error) {
	return ListPendingAutoSyncEventsTx(DB, eventType, cutoffGeneration)
}

// MarkAutoSyncEventsProcessedTx terminally marks exactly the supplied event
// IDs. Keeping the type/cutoff predicates prevents a stale handler from
// absorbing a successor generation.
func MarkAutoSyncEventsProcessedTx(tx *gorm.DB, eventType string, cutoffGeneration int64, eventIDs []int64, taskID string) error {
	if tx == nil {
		return errors.New("auto sync transaction is nil")
	}
	if len(eventIDs) == 0 {
		return nil
	}
	now := common.GetTimestamp()
	return tx.Model(&AutoSyncEvent{}).
		Where("id IN ? AND type = ? AND generation <= ? AND processed_at IS NULL", eventIDs, eventType, cutoffGeneration).
		Updates(map[string]any{"task_id": taskID, "processed_at": now}).Error
}

// FinalizeAutoSyncBatchTx marks this handler's event IDs terminal and clears a
// cursor only when no successor generation exists. It is intended to compose
// with the task terminal update in the handler's final transaction.
func FinalizeAutoSyncBatchTx(tx *gorm.DB, eventType string, cutoffGeneration int64, eventIDs []int64, taskID string) error {
	if tx == nil {
		return errors.New("auto sync transaction is nil")
	}
	if err := MarkAutoSyncEventsProcessedTx(tx, eventType, cutoffGeneration, eventIDs, taskID); err != nil {
		return err
	}
	lock := autoSyncCursorLock(eventType)
	lock.Lock()
	defer lock.Unlock()
	var cursor AutoSyncCursor
	err := lockForUpdate(tx).Where("type = ?", eventType).First(&cursor).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if cursor.Generation <= cutoffGeneration {
		return tx.Model(&AutoSyncCursor{}).Where("type = ? AND generation = ?", eventType, cursor.Generation).Update("due_at", 0).Error
	}
	return nil
}
