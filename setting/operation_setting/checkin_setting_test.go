package operation_setting

import (
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	configpkg "github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCheckinQuotaForBalanceUsesLegacyModeOnlyWhenTiersAreDisabled(t *testing.T) {
	legacy := CheckinSetting{
		MinQuota: 7,
		MaxQuota: 9,
	}

	reward, err := legacy.GetCheckinQuotaForBalance(500, func(size int) int {
		require.Equal(t, 3, size)
		return 1
	})
	require.NoError(t, err)
	assert.Equal(t, 8, reward)

	legacy.BalanceTierEnabled = true
	legacy.BalanceTiers = []CheckinBalanceTier{}
	_, err = legacy.GetCheckinQuotaForBalance(500, nil)
	require.ErrorContains(t, err, "balance_tiers must not be empty")
}

func TestCheckinQuotaForBalanceSelectsLowestMiddleAndHighestTiers(t *testing.T) {
	setting := CheckinSetting{
		MinQuota:           1,
		MaxQuota:           1,
		BalanceTierEnabled: true,
		BalanceTiers: []CheckinBalanceTier{
			{MinBalance: 1000, MinReward: 30, MaxReward: 40},
			{MinBalance: 5000, MinReward: 50, MaxReward: 60},
			{MinBalance: 100, MinReward: 10, MaxReward: 20},
		},
	}

	tests := []struct {
		name    string
		balance int
		want    int
		random  func(int) int
	}{
		{name: "below first tier", balance: 50, want: 10, random: func(int) int { return 0 }},
		{name: "middle tier", balance: 1500, want: 40, random: func(size int) int { return size - 1 }},
		{name: "above highest tier", balance: 9000, want: 50, random: func(int) int { return 0 }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reward, err := setting.GetCheckinQuotaForBalance(tt.balance, tt.random)
			require.NoError(t, err)
			assert.Equal(t, tt.want, reward)
		})
	}
}

func TestCheckinQuotaForBalanceHonorsRandomBoundariesAndFixedRewards(t *testing.T) {
	setting := CheckinSetting{
		BalanceTierEnabled: true,
		BalanceTiers:       []CheckinBalanceTier{{MinBalance: 0, MinReward: 3, MaxReward: 5}},
	}

	reward, err := setting.GetCheckinQuotaForBalance(0, func(int) int { return 0 })
	require.NoError(t, err)
	assert.Equal(t, 3, reward)

	reward, err = setting.GetCheckinQuotaForBalance(0, func(size int) int { return size - 1 })
	require.NoError(t, err)
	assert.Equal(t, 5, reward)

	fixed := CheckinSetting{
		BalanceTierEnabled: true,
		BalanceTiers:       []CheckinBalanceTier{{MinBalance: 0, MinReward: 12, MaxReward: 12}},
	}
	called := false
	reward, err = fixed.GetCheckinQuotaForBalance(0, func(int) int {
		called = true
		return 0
	})
	require.NoError(t, err)
	assert.Equal(t, 12, reward)
	assert.False(t, called)
}

func TestInvalidCheckinConfigurationIsRejectedWithoutNegativeRewards(t *testing.T) {
	setting := CheckinSetting{
		MinQuota:           8,
		MaxQuota:           8,
		BalanceTierEnabled: true,
		BalanceTiers:       []CheckinBalanceTier{{MinBalance: 0, MinReward: -1, MaxReward: 3}},
	}

	_, err := setting.GetCheckinQuotaForBalance(0, func(int) int { return 0 })
	require.ErrorContains(t, err, "min_reward")

	_, err = (CheckinSetting{MinQuota: -1, MaxQuota: 1}).GetCheckinQuotaForBalance(0, nil)
	require.Error(t, err)

	require.Error(t, ValidateCheckinBalanceTiers([]CheckinBalanceTier{
		{MinBalance: 100, MinReward: 20, MaxReward: 10},
	}))
	require.Error(t, ValidateCheckinBalanceTiers([]CheckinBalanceTier{
		{MinBalance: 100, MinReward: 1, MaxReward: 1},
		{MinBalance: 100, MinReward: 2, MaxReward: 2},
	}))
	require.Error(t, ValidateCheckinBalanceTiers([]CheckinBalanceTier{{MinBalance: -1, MinReward: 0, MaxReward: 0}}))
	require.Error(t, ValidateCheckinBalanceTiers([]CheckinBalanceTier{{MinBalance: 0, MinReward: 0, MaxReward: common.MaxQuota + 1}}))
	tooMany := make([]CheckinBalanceTier, MaxCheckinBalanceTiers+1)
	for index := range tooMany {
		tooMany[index] = CheckinBalanceTier{MinBalance: index, MinReward: 0, MaxReward: 0}
	}
	require.Error(t, ValidateCheckinBalanceTiers(tooMany))
}

func TestCheckinSettingOptionValidationUsesStableJSONSchema(t *testing.T) {
	var parsed CheckinSetting
	require.NoError(t, common.UnmarshalJsonStr(`{"balance_tier_enabled":true,"balance_tiers":[{"min_balance":100,"min_reward":5,"max_reward":10}]}`, &parsed))
	assert.True(t, parsed.BalanceTierEnabled)
	require.Len(t, parsed.BalanceTiers, 1)
	assert.Equal(t, 100, parsed.BalanceTiers[0].MinBalance)

	require.NoError(t, ValidateCheckinBalanceTiersJSON(`[]`))
	require.Error(t, ValidateCheckinBalanceTiersJSON(`{"min_balance":0}`))
	require.Error(t, ValidateCheckinSettingOption(checkinBalanceTiersOptionKey, `[{"min_balance":0,"min_reward":9,"max_reward":1}]`))
}

func TestCheckinSettingOptionValidationRejectsUnsafeLegacyRanges(t *testing.T) {
	setting := GetCheckinSetting()
	original := *setting
	t.Cleanup(func() { *setting = original })
	*setting = CheckinSetting{MinQuota: 1, MaxQuota: 2}

	require.Error(t, ValidateCheckinSettingOption(checkinMinQuotaOptionKey, "3"))
	require.Error(t, ValidateCheckinSettingOption(checkinMaxQuotaOptionKey, "-1"))
	require.Error(t, ValidateCheckinSettingOption(checkinMaxQuotaOptionKey, strconv.Itoa(common.MaxQuota+1)))
}

func TestCheckinSettingConfigUpdateRejectsInvalidTierWithoutChangingRuntimeConfig(t *testing.T) {
	setting := GetCheckinSetting()
	original := *setting
	t.Cleanup(func() { *setting = original })
	*setting = CheckinSetting{
		MinQuota:     1,
		MaxQuota:     2,
		BalanceTiers: []CheckinBalanceTier{{MinBalance: 0, MinReward: 1, MaxReward: 1}},
	}

	err := configpkg.UpdateConfigFromMap(setting, map[string]string{
		"balance_tiers": `[{"min_balance":0,"min_reward":5,"max_reward":1}]`,
	})
	require.Error(t, err)
	assert.Equal(t, []CheckinBalanceTier{{MinBalance: 0, MinReward: 1, MaxReward: 1}}, setting.BalanceTiers)

	exported, err := configpkg.ConfigToMap(setting)
	require.NoError(t, err)
	assert.Equal(t, `[{"min_balance":0,"min_reward":1,"max_reward":1}]`, exported["balance_tiers"])
}
