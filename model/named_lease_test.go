package model

import (
	"sync"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func prepareNamedLeaseTest(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&NamedLease{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&NamedLease{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Delete(&NamedLease{}).Error)
	})
}

func TestNamedLeaseSingleOwner(t *testing.T) {
	prepareNamedLeaseTest(t)

	ok, err := AcquireNamedLease("scheduler", "node-a", 100, 200)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = AcquireNamedLease("scheduler", "node-b", 101, 201)
	require.NoError(t, err)
	assert.False(t, ok)
	ok, err = RenewNamedLease("scheduler", "node-a", 150, 250)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = ReleaseNamedLease("scheduler", "node-a")
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = AcquireNamedLease("scheduler", "node-b", 151, 251)
	require.NoError(t, err)
	assert.True(t, ok)
}

func TestNamedLeaseConcurrentAcquireHasOneWinner(t *testing.T) {
	prepareNamedLeaseTest(t)

	const contenders = 8
	type result struct {
		ok  bool
		err error
	}
	results := make(chan result, contenders)
	var wg sync.WaitGroup
	wg.Add(contenders)
	for i := 0; i < contenders; i++ {
		go func() {
			defer wg.Done()
			ok, err := AcquireNamedLease("scheduler", "node", 100, 200)
			results <- result{ok: ok, err: err}
		}()
	}
	wg.Wait()
	close(results)

	winners := 0
	for result := range results {
		require.NoError(t, result.err)
		if result.ok {
			winners++
		}
	}
	assert.Equal(t, 1, winners)
}

func TestNamedLeaseExpiredTakeoverRejectsOldHolder(t *testing.T) {
	prepareNamedLeaseTest(t)

	ok, err := AcquireNamedLease("scheduler", "node-a", 100, 200)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = AcquireNamedLease("scheduler", "node-b", 201, 300)
	require.NoError(t, err)
	require.True(t, ok)
	ok, err = RenewNamedLease("scheduler", "node-a", 201, 400)
	require.NoError(t, err)
	assert.False(t, ok)
	ok, err = ReleaseNamedLease("scheduler", "node-a")
	require.NoError(t, err)
	assert.False(t, ok)
	ok, err = RenewNamedLease("scheduler", "node-b", 300, 400)
	require.NoError(t, err)
	require.True(t, ok, "a lease is valid through its expiration instant")
}

func TestNamedLeaseTransactionRollback(t *testing.T) {
	prepareNamedLeaseTest(t)

	tx := DB.Begin()
	require.NoError(t, tx.Error)
	ok, err := acquireNamedLease(tx, "scheduler", "node-a", 100, 200)
	require.NoError(t, err)
	require.True(t, ok)
	require.NoError(t, tx.Rollback().Error)

	ok, err = AcquireNamedLease("scheduler", "node-b", 100, 200)
	require.NoError(t, err)
	assert.True(t, ok)
}

func TestNamedLeaseDatabaseErrorsAreNotBusy(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&NamedLease{}))
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, sqlDB.Close())

	ok, err := AcquireNamedLease("scheduler", "node-a", 100, 200)
	assert.False(t, ok)
	require.Error(t, err)
	ok, err = RenewNamedLease("scheduler", "node-a", 100, 200)
	assert.False(t, ok)
	require.Error(t, err)
	ok, err = ReleaseNamedLease("scheduler", "node-a")
	assert.False(t, ok)
	require.Error(t, err)
}

func TestGetNamedLeaseExpirySemantics(t *testing.T) {
	prepareNamedLeaseTest(t)

	lease, err := GetNamedLease("missing")
	require.NoError(t, err)
	assert.Nil(t, lease)

	require.NoError(t, DB.Create(&NamedLease{Name: "queue", Holder: "node", ExpiresAt: 100, UpdatedAt: 1}).Error)
	lease, err = GetNamedLease("queue")
	require.NoError(t, err)
	require.NotNil(t, lease)
	assert.Equal(t, int64(100), lease.ExpiresAt)
}
