package service

import (
	"context"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func useServiceLeaseDB(t *testing.T) *gorm.DB {
	t.Helper()
	previous := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.NamedLease{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previous })
	return db
}

func TestWithNamedLeaseBusyHeartbeatAndRelease(t *testing.T) {
	db := useServiceLeaseDB(t)
	now := time.Now().Unix()
	ok, err := model.AcquireNamedLease("metadata", "other", now, now+60)
	require.NoError(t, err)
	require.True(t, ok)
	assert.ErrorIs(t, WithNamedLease(context.Background(), "metadata", "mine", time.Second, func(context.Context) error { return nil }), ErrNamedLeaseBusy)
	_, err = model.ReleaseNamedLease("metadata", "other")
	require.NoError(t, err)

	require.NoError(t, WithNamedLease(context.Background(), "metadata", "mine", time.Second, func(ctx context.Context) error {
		time.Sleep(1100 * time.Millisecond)
		return ctx.Err()
	}))
	var count int64
	require.NoError(t, db.Model(&model.NamedLease{}).Where("name = ?", "metadata").Count(&count).Error)
	assert.Zero(t, count)
}

func TestWithNamedLeaseReturnsDatabaseError(t *testing.T) {
	db := useServiceLeaseDB(t)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())
	err = WithNamedLease(context.Background(), "metadata", "mine", time.Second, func(context.Context) error { return nil })
	assert.NotErrorIs(t, err, ErrNamedLeaseBusy)
	require.Error(t, err)
}

func TestWithNamedLeaseCanceledContextDoesNotAcquireOrRun(t *testing.T) {
	db := useServiceLeaseDB(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	ran := false
	require.ErrorIs(t, WithNamedLease(ctx, "metadata", "mine", time.Second, func(context.Context) error {
		ran = true
		return nil
	}), context.Canceled)
	assert.False(t, ran)
	var count int64
	require.NoError(t, db.Model(&model.NamedLease{}).Count(&count).Error)
	assert.Zero(t, count)
}

func TestWithNamedLeaseHolderReplacementCancelsCallback(t *testing.T) {
	db := useServiceLeaseDB(t)
	callbackCanceled := make(chan struct{})
	err := WithNamedLease(context.Background(), "metadata", "owner", time.Second, func(ctx context.Context) error {
		require.NoError(t, db.Model(&model.NamedLease{}).Where("name = ?", "metadata").Update("holder", "replacement").Error)
		<-ctx.Done()
		close(callbackCanceled)
		return ctx.Err()
	})
	require.ErrorIs(t, err, ErrNamedLeaseBusy)
	select {
	case <-callbackCanceled:
	default:
		t.Fatal("callback context was not canceled before WithNamedLease returned")
	}
}

func TestWithNamedLeaseRenewFailureCancelsCallback(t *testing.T) {
	db := useServiceLeaseDB(t)
	callbackCanceled := make(chan struct{})
	err := WithNamedLease(context.Background(), "metadata", "owner", time.Second, func(ctx context.Context) error {
		sqlDB, dbErr := db.DB()
		require.NoError(t, dbErr)
		require.NoError(t, sqlDB.Close())
		<-ctx.Done()
		close(callbackCanceled)
		return ctx.Err()
	})
	require.Error(t, err)
	assert.NotErrorIs(t, err, ErrNamedLeaseBusy)
	select {
	case <-callbackCanceled:
	default:
		t.Fatal("callback context was not canceled after renewal failure")
	}
}
