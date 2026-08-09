package setting

import (
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserRequestRateLimitDefaultsAndValidation(t *testing.T) {
	assert.False(t, UserRequestRateLimitEnabled)
	assert.Equal(t, DefaultUserRequestsPerMinute, UserRequestRateLimitDefault)

	validValues := []*int{nil}
	for _, value := range []int{0, 1, MaxUserRequestsPerMinute} {
		value := value
		validValues = append(validValues, &value)
	}
	for _, value := range validValues {
		require.NoError(t, ValidateUserRequestsPerMinute(value))
	}

	for _, value := range []int{-1, MaxUserRequestsPerMinute + 1} {
		value := value
		assert.Error(t, ValidateUserRequestsPerMinute(&value))
	}
	require.NoError(t, ValidateUserRequestRateLimitDefault("1"))
	require.NoError(t, ValidateUserRequestRateLimitDefault("60"))
	assert.Error(t, ValidateUserRequestRateLimitDefault("0"))
	assert.Error(t, ValidateUserRequestRateLimitDefault("-1"))
	assert.Error(t, ValidateUserRequestRateLimitDefault("not-a-number"))
	assert.Error(t, ValidateUserRequestRateLimitDefault(strconv.Itoa(MaxUserRequestsPerMinute+1)))
}
