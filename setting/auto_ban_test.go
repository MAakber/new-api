package setting

import (
	"net"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestAutoBanConfigValidationAndNormalization(t *testing.T) {
	value := `{
		"enabled":true,
		"exempt_user_ids":[9,3,9],
		"exempt_groups":[" trusted ","trusted","internal"],
		"exempt_ip_cidrs":["203.0.113.5","2001:db8::1/64"],
		"user_agent":{"enabled":true,"mode":"enforce","threshold":3,"window_minutes":10,"ban_duration_minutes":10080,"response_status":404,"response_message":"Not Found","response_code":"not_found"}
	}`
	normalized, err := ValidateAndNormalizeAutoBanConfigJSON(value)
	require.NoError(t, err)
	require.NoError(t, UpdateAutoBanConfigByJSONString(normalized))
	t.Cleanup(func() { require.NoError(t, storeAutoBanConfig(DefaultAutoBanConfig())) })

	config := GetAutoBanConfig()
	require.Equal(t, []int{3, 9}, config.ExemptUserIDs)
	require.Equal(t, []string{"internal", "trusted"}, config.ExemptGroups)
	require.Equal(t, []string{"2001:db8::/64", "203.0.113.5/32"}, config.ExemptIPCIDRs)
	require.Equal(t, 404, config.UserAgent.ResponseStatus)
	require.Equal(t, 5, config.SensitiveWords.Threshold, "missing nested fields retain defaults")
	require.True(t, IsAutoBanExempt(3, common.RoleCommonUser, "default", net.ParseIP("198.51.100.1")))
	require.True(t, IsAutoBanExempt(100, common.RoleCommonUser, "trusted", net.ParseIP("198.51.100.1")))
	require.True(t, IsAutoBanExempt(100, common.RoleCommonUser, "default", net.ParseIP("203.0.113.5")))
	require.True(t, IsAutoBanExempt(100, common.RoleAdminUser, "default", net.ParseIP("198.51.100.1")))
	require.False(t, IsAutoBanExempt(100, common.RoleCommonUser, "default", net.ParseIP("198.51.100.1")))
}

func TestAutoBanConfigRejectsUnsafeValues(t *testing.T) {
	for _, value := range []string{
		`{"unknown":true}`,
		`{"user_agent":{"response_status":200}}`,
		`{"user_agent":{"response_code":"bad code"}}`,
		`{"exempt_ip_cidrs":["not-an-ip"]}`,
		`{} {}`,
	} {
		_, err := ValidateAndNormalizeAutoBanConfigJSON(value)
		require.Error(t, err, value)
	}
}

func TestAutoBanConfigAllowsPermanentBanDuration(t *testing.T) {
	_, err := ValidateAndNormalizeAutoBanConfigJSON(`{"user_agent":{"ban_duration_minutes":-1}}`)
	require.NoError(t, err)
	for _, duration := range []int{0, -2} {
		_, err := ValidateAndNormalizeAutoBanConfigJSON(`{"user_agent":{"ban_duration_minutes":` + strconv.Itoa(duration) + `}}`)
		require.Error(t, err)
	}
}
