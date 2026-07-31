package model

import (
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func prepareAutoPriceGuardTable(t *testing.T) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&AutoPriceGuard{}))
	t.Cleanup(func() { DB.Exec("DELETE FROM channel_auto_price_guards") })
}

func TestAutoPriceGuardRequestDeleteCASAndTombstone(t *testing.T) {
	prepareAutoPriceGuardTable(t)
	guard := &AutoPriceGuard{ChannelID: 12}
	require.NoError(t, DB.Create(guard).Error)

	var wg sync.WaitGroup
	results := make(chan AutoPriceGuardCASResult, 2)
	errs := make(chan error, 2)
	for _, transition := range []func(int64) (AutoPriceGuardCASResult, error){UseAutoPriceGuardCAS, DeleteAutoPriceGuardCAS} {
		wg.Add(1)
		go func(transition func(int64) (AutoPriceGuardCASResult, error)) {
			defer wg.Done()
			result, err := transition(guard.ID)
			results <- result
			errs <- err
		}(transition)
	}
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		require.NoError(t, err)
	}
	wins := 0
	for result := range results {
		if result.Transitioned {
			wins++
		}
	}
	assert.Equal(t, 1, wins)

	reloaded, err := GetAutoPriceGuard(guard.ID)
	require.NoError(t, err)
	require.NotNil(t, reloaded)
	if reloaded.State == AutoPriceGuardStateDeleting {
		updated, err := UpdateAutoPriceGuardTerminal(guard.ID, AutoPriceGuardStateDeleted, "deleted channel")
		require.NoError(t, err)
		require.True(t, updated)
		tombstone, err := GetAutoPriceGuard(guard.ID)
		require.NoError(t, err)
		assert.Equal(t, AutoPriceGuardStateDeleted, tombstone.State)
	}
}

func TestAutoPriceGuardMissingAndTerminalStatesAreDistinct(t *testing.T) {
	prepareAutoPriceGuardTable(t)
	missing, err := GetAutoPriceGuard(999999)
	require.NoError(t, err)
	assert.Nil(t, missing)

	result, err := UseAutoPriceGuardCAS(999999)
	require.NoError(t, err)
	assert.False(t, result.Found)

	guard := &AutoPriceGuard{ChannelID: 23, State: AutoPriceGuardStateDeleting}
	require.NoError(t, DB.Create(guard).Error)
	updated, err := UpdateAutoPriceGuardTerminal(guard.ID, AutoPriceGuardStateDeleted, "completed")
	require.NoError(t, err)
	require.True(t, updated)
	result, err = UseAutoPriceGuardCAS(guard.ID)
	require.NoError(t, err)
	assert.True(t, result.Found)
	assert.False(t, result.Transitioned)
	assert.Equal(t, AutoPriceGuardStateDeleted, result.State)
}

func TestAutoPriceGuardInvalidationAndTxRollback(t *testing.T) {
	prepareAutoPriceGuardTable(t)
	guard := &AutoPriceGuard{ChannelID: 34}
	require.NoError(t, DB.Create(guard).Error)

	tx := DB.Begin()
	result, err := InvalidateAutoPriceGuardTx(tx, guard.ID, "channel edited")
	require.NoError(t, err)
	require.True(t, result.Transitioned)
	inside, err := GetAutoPriceGuardTx(tx, guard.ID)
	require.NoError(t, err)
	assert.Equal(t, AutoPriceGuardStateInvalidated, inside.State)
	assert.Equal(t, "channel edited", inside.Reason)
	require.NoError(t, tx.Rollback().Error)

	reloaded, err := GetAutoPriceGuard(guard.ID)
	require.NoError(t, err)
	assert.Equal(t, AutoPriceGuardStatePending, reloaded.State)
	assert.Empty(t, reloaded.Reason)

	result, err = InvalidateAutoPriceGuardCAS(guard.ID, "channel edited")
	require.NoError(t, err)
	require.True(t, result.Transitioned)
	reloaded, err = GetAutoPriceGuard(guard.ID)
	require.NoError(t, err)
	assert.Equal(t, AutoPriceGuardStateInvalidated, reloaded.State)
	assert.Equal(t, "channel edited", reloaded.Reason)
}

func TestUseChannelAutoPriceGuardCASBindsOwner(t *testing.T) {
	prepareAutoPriceGuardTable(t)
	guard := &AutoPriceGuard{ChannelID: 55}
	require.NoError(t, DB.Create(guard).Error)
	result, err := UseChannelAutoPriceGuardCAS(guard.ID, 56)
	require.NoError(t, err)
	assert.True(t, result.Found)
	assert.False(t, result.OwnerMatched)
	assert.Equal(t, 55, result.ChannelID)
	assert.Equal(t, AutoPriceGuardStatePending, result.State)
}
