package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestRequestDebugRawOptionFailsClosedAndUpdatesRuntime(t *testing.T) {
	previousMap := common.OptionMap
	previousRaw := common.IsRequestDebugRawEnabled()
	common.OptionMap = map[string]string{}
	common.SetRequestDebugRawEnabled(false)
	t.Cleanup(func() {
		common.OptionMap = previousMap
		common.SetRequestDebugRawEnabled(previousRaw)
	})

	require.NoError(t, updateOptionMap("request_debug.raw_enabled", "true"))
	require.True(t, common.IsRequestDebugRawEnabled())
	require.Equal(t, "true", common.OptionMap["request_debug.raw_enabled"])
	require.NoError(t, updateOptionMap("request_debug.raw_enabled", "not-a-bool"))
	require.False(t, common.IsRequestDebugRawEnabled())
	require.Equal(t, "false", common.OptionMap["request_debug.raw_enabled"])
}
