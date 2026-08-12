package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateChannelQueueSettings(t *testing.T) {
	c := &Channel{
		Models: "gpt-4o,gpt-4o-mini",
		Status: common.ChannelStatusEnabled,
	}

	t.Run("disabled is always valid", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{Enabled: false}, c)
		require.NoError(t, err)
	})

	t.Run("enabled without model rejected", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{Enabled: true}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "model is required")
	})

	t.Run("enabled with model not in channel rejected", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled:  true,
			Model:    "claude-3",
			Interval: 30,
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not in the channel model list")
	})

	t.Run("valid enabled config", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled:  true,
			Model:    "gpt-4o",
			Interval: 30,
			Timeout:  25,
		}, c)
		require.NoError(t, err)
	})

	t.Run("interval too small", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 0, Timeout: 1,
		}, c)
		require.Error(t, err)
	})

	t.Run("timeout must be less than interval", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 10, Timeout: 10,
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "less than interval")
	})

	t.Run("timeout duration has a safe upper bound", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: MaxQueueDurationSeconds,
			Timeout: MaxQueueDurationSeconds + 1,
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "queue timeout must be at most 86400 seconds")
	})

	t.Run("cooldown duration has a safe upper bound", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 30,
			CooldownSeconds: MaxQueueDurationSeconds + 1,
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "queue cooldown_seconds must be at most 86400 seconds")
	})

	t.Run("backoff duration has a safe upper bound", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 30,
			BackoffSeconds: MaxQueueDurationSeconds + 1,
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "queue backoff_seconds must be at most 86400 seconds")
	})

	t.Run("invalid busy status code", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 30, Timeout: 5,
			QueueBusyStatusCodes: []int{429, 9999},
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid status code")
	})

	t.Run("invalid endpoint type", func(t *testing.T) {
		err := validateChannelQueueSettings(&dto.ChannelQueueSettings{
			Enabled: true, Model: "gpt-4o", Interval: 30, Timeout: 5,
			EndpointType: "bogus",
		}, c)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid queue endpoint_type")
	})
}

func TestHasModel(t *testing.T) {
	c := &Channel{Models: "a,b ,c"}
	assert.True(t, c.hasModel("a"))
	assert.True(t, c.hasModel("b"))
	assert.True(t, c.hasModel("c"))
	assert.False(t, c.hasModel("d"))
}
