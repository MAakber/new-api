package setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpstreamInterceptionConfigCompilesKeywordRegexAndExclusions(t *testing.T) {
	t.Cleanup(func() {
		_, _ = SetUpstreamInterceptionConfig(DefaultUpstreamInterceptionConfigJSON())
	})
	raw := `{"enabled":true,"action":"remove","retry_on_block":true,"error_status":502,"error_code":"upstream_ad","error_message":"blocked","excluded_channel_ids":[7,3,7],"rules":[{"name":"group","type":"keyword","expression":"通知群","enabled":true},{"name":"number","type":"regex","expression":"群\\s*\\d+","enabled":true}]}`
	normalized, err := SetUpstreamInterceptionConfig(raw)
	require.NoError(t, err)
	require.Contains(t, normalized, `"excluded_channel_ids":[3,7]`)
	require.Nil(t, GetUpstreamInterceptionSnapshot(3))

	snapshot := GetUpstreamInterceptionSnapshot(4)
	require.NotNil(t, snapshot)
	matches := snapshot.FindMatches("请加入通知群 114514")
	require.Len(t, matches, 2)
	require.Equal(t, "group", matches[0].RuleName)
}

func TestUpstreamInterceptionConfigRejectsUnsafeRulesWithoutReplacingSnapshot(t *testing.T) {
	t.Cleanup(func() {
		_, _ = SetUpstreamInterceptionConfig(DefaultUpstreamInterceptionConfigJSON())
	})
	_, err := SetUpstreamInterceptionConfig(`{"enabled":true,"action":"block","error_status":502,"error_code":"blocked","error_message":"blocked","rules":[{"name":"valid","type":"keyword","expression":"ad","enabled":true}]}`)
	require.NoError(t, err)
	before := GetUpstreamInterceptionSnapshot(1)
	require.NotNil(t, before)

	_, err = SetUpstreamInterceptionConfig(`{"enabled":true,"action":"block","error_status":502,"error_code":"blocked","error_message":"blocked","rules":[{"name":"bad","type":"regex","expression":".*","enabled":true}]}`)
	require.Error(t, err)
	require.Same(t, before, GetUpstreamInterceptionSnapshot(1))
}
