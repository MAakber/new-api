package common

import (
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/stretchr/testify/assert"
)

func TestInitConstantEnvEnablesErrorLogsByDefault(t *testing.T) {
	previous := constant.ErrorLogEnabled
	t.Cleanup(func() {
		constant.ErrorLogEnabled = previous
	})

	t.Setenv("ERROR_LOG_ENABLED", "")
	initConstantEnv()
	assert.True(t, constant.ErrorLogEnabled)

	t.Setenv("ERROR_LOG_ENABLED", "false")
	initConstantEnv()
	assert.False(t, constant.ErrorLogEnabled)
}
