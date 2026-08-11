package operation_setting

import (
	"encoding/json"
	"fmt"
	"math"
	"math/rand"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	// MaxCheckinBalanceTiers bounds operator-controlled configuration so a
	// malformed setting cannot create an unnecessarily expensive match path.
	MaxCheckinBalanceTiers          = 32
	maxCheckinBalanceTiersJSONBytes = 16 * 1024

	checkinEnabledOptionKey      = "checkin_setting.enabled"
	checkinMinQuotaOptionKey     = "checkin_setting.min_quota"
	checkinMaxQuotaOptionKey     = "checkin_setting.max_quota"
	checkinBalanceTierEnabledKey = "checkin_setting.balance_tier_enabled"
	checkinBalanceTiersOptionKey = "checkin_setting.balance_tiers"
)

// CheckinBalanceTier describes the reward range for users whose available
// balance is at least MinBalance. All values are quota units.
type CheckinBalanceTier struct {
	MinBalance int `json:"min_balance"`
	MinReward  int `json:"min_reward"`
	MaxReward  int `json:"max_reward"`
}

// CheckinSetting 签到功能配置
type CheckinSetting struct {
	Enabled            bool                 `json:"enabled"`              // 是否启用签到功能
	MinQuota           int                  `json:"min_quota"`            // 签到最小额度奖励
	MaxQuota           int                  `json:"max_quota"`            // 签到最大额度奖励
	BalanceTierEnabled bool                 `json:"balance_tier_enabled"` // 是否启用余额阶梯奖励
	BalanceTiers       []CheckinBalanceTier `json:"balance_tiers"`        // 余额阶梯奖励配置
}

// 默认配置
var checkinSetting = CheckinSetting{
	Enabled:            false, // 默认关闭
	MinQuota:           1000,  // 默认最小额度 1000 (约 0.002 USD)
	MaxQuota:           10000, // 默认最大额度 10000 (约 0.02 USD)
	BalanceTierEnabled: false,
	BalanceTiers:       []CheckinBalanceTier{},
}

func init() {
	// 注册到全局配置管理器
	config.GlobalConfig.Register("checkin_setting", &checkinSetting)
}

// GetCheckinSetting 获取签到配置
func GetCheckinSetting() *CheckinSetting {
	return &checkinSetting
}

// IsCheckinEnabled 是否启用签到功能
func IsCheckinEnabled() bool {
	return checkinSetting.Enabled
}

// GetCheckinQuotaRange 获取签到额度范围
func GetCheckinQuotaRange() (min, max int) {
	return checkinSetting.MinQuota, checkinSetting.MaxQuota
}

// Validate validates both the legacy reward range and the optional balance
// tiers. When balance tiers are enabled, at least one valid tier is required;
// otherwise the legacy min/max range remains the active reward source.
func (setting CheckinSetting) Validate() error {
	if err := validateCheckinQuota("min_quota", setting.MinQuota); err != nil {
		return err
	}
	if err := validateCheckinQuota("max_quota", setting.MaxQuota); err != nil {
		return err
	}
	if setting.MinQuota > setting.MaxQuota {
		return fmt.Errorf("min_quota must not exceed max_quota")
	}
	if setting.BalanceTierEnabled && len(setting.BalanceTiers) == 0 {
		return fmt.Errorf("balance_tiers must not be empty when balance_tier_enabled is true")
	}
	return ValidateCheckinBalanceTiers(setting.BalanceTiers)
}

// ValidateCheckinBalanceTiers validates an operator-provided tier list. Tiers
// may be supplied in any order because matching is based on the highest
// applicable min_balance, but min_balance values must be unique.
func ValidateCheckinBalanceTiers(tiers []CheckinBalanceTier) error {
	if len(tiers) > MaxCheckinBalanceTiers {
		return fmt.Errorf("balance_tiers must not contain more than %d tiers", MaxCheckinBalanceTiers)
	}

	seenBalances := make(map[int]struct{}, len(tiers))
	for index, tier := range tiers {
		if tier.MinBalance < 0 || tier.MinBalance > common.MaxQuota {
			return fmt.Errorf("balance_tiers[%d].min_balance must be between 0 and %d", index, common.MaxQuota)
		}
		if _, exists := seenBalances[tier.MinBalance]; exists {
			return fmt.Errorf("balance_tiers[%d].min_balance is duplicated", index)
		}
		seenBalances[tier.MinBalance] = struct{}{}
		if err := validateCheckinQuota(fmt.Sprintf("balance_tiers[%d].min_reward", index), tier.MinReward); err != nil {
			return err
		}
		if err := validateCheckinQuota(fmt.Sprintf("balance_tiers[%d].max_reward", index), tier.MaxReward); err != nil {
			return err
		}
		if tier.MinReward > tier.MaxReward {
			return fmt.Errorf("balance_tiers[%d].min_reward must not exceed max_reward", index)
		}
	}
	return nil
}

// ValidateCheckinBalanceTiersJSON validates the JSON value persisted by the
// generic option endpoint. The value must be an array.
func ValidateCheckinBalanceTiersJSON(value string) error {
	_, err := parseCheckinBalanceTiersJSON(value)
	return err
}

func parseCheckinBalanceTiersJSON(value string) ([]CheckinBalanceTier, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed[0] != '[' {
		return nil, fmt.Errorf("balance_tiers must be a JSON array")
	}
	if len(trimmed) > maxCheckinBalanceTiersJSONBytes {
		return nil, fmt.Errorf("balance_tiers JSON must not exceed %d bytes", maxCheckinBalanceTiersJSONBytes)
	}
	var rawTiers []json.RawMessage
	if err := common.UnmarshalJsonStr(trimmed, &rawTiers); err != nil {
		return nil, fmt.Errorf("invalid balance_tiers JSON: %w", err)
	}
	for index, rawTier := range rawTiers {
		if common.GetJsonType(rawTier) != "object" {
			return nil, fmt.Errorf("balance_tiers[%d] must be an object", index)
		}
	}
	var tiers []CheckinBalanceTier
	if err := common.UnmarshalJsonStr(trimmed, &tiers); err != nil {
		return nil, fmt.Errorf("invalid balance_tiers JSON: %w", err)
	}
	if err := ValidateCheckinBalanceTiers(tiers); err != nil {
		return nil, err
	}
	return tiers, nil
}

// ValidateCheckinSettingOption validates a single generic option update
// before it is persisted. Legacy min/max updates are checked against the
// current setting so inverted ranges cannot become active.
func ValidateCheckinSettingOption(key, value string) error {
	switch key {
	case checkinEnabledOptionKey, checkinMinQuotaOptionKey, checkinMaxQuotaOptionKey,
		checkinBalanceTierEnabledKey, checkinBalanceTiersOptionKey:
		current := *GetCheckinSetting()
		return current.ValidateConfigMap(map[string]string{
			strings.TrimPrefix(key, "checkin_setting."): value,
		})
	default:
		return nil
	}
}

// ValidateConfigMap validates a complete or partial generic configuration
// update against the current setting. It is called by config.UpdateConfigFromMap
// before reflection applies fields, so a pair such as enabling tiers and
// supplying the tier list is validated atomically.
func (setting CheckinSetting) ValidateConfigMap(configMap map[string]string) error {
	candidate := setting
	for key, value := range configMap {
		key = strings.TrimPrefix(key, "checkin_setting.")
		switch key {
		case "enabled", "balance_tier_enabled":
			parsed, err := strconv.ParseBool(strings.TrimSpace(value))
			if err != nil {
				return fmt.Errorf("%s must be a boolean", key)
			}
			if key == "enabled" {
				candidate.Enabled = parsed
			} else {
				candidate.BalanceTierEnabled = parsed
			}
		case "min_quota", "max_quota":
			quota, err := parseCheckinQuota(value)
			if err != nil {
				return fmt.Errorf("%s: %w", key, err)
			}
			if key == "min_quota" {
				candidate.MinQuota = quota
			} else {
				candidate.MaxQuota = quota
			}
		case "balance_tiers":
			tiers, err := parseCheckinBalanceTiersJSON(value)
			if err != nil {
				return err
			}
			candidate.BalanceTiers = tiers
		}
	}
	return candidate.Validate()
}

// GetCheckinQuotaForBalance returns the reward selected for a user's balance.
// randomIntn is injectable for deterministic boundary tests; production calls
// pass nil and use math/rand.Intn. The legacy range is used only when balance
// tiers are disabled.
func (setting CheckinSetting) GetCheckinQuotaForBalance(balance int, randomIntn func(int) int) (int, error) {
	if !setting.BalanceTierEnabled {
		return randomCheckinReward(setting.MinQuota, setting.MaxQuota, randomIntn)
	}
	if len(setting.BalanceTiers) == 0 {
		return 0, fmt.Errorf("balance_tiers must not be empty when balance_tier_enabled is true")
	}
	if err := ValidateCheckinBalanceTiers(setting.BalanceTiers); err != nil {
		return 0, err
	}

	tier := matchCheckinBalanceTier(setting.BalanceTiers, balance)
	return randomCheckinReward(tier.MinReward, tier.MaxReward, randomIntn)
}

func matchCheckinBalanceTier(tiers []CheckinBalanceTier, balance int) CheckinBalanceTier {
	lowest := tiers[0]
	var matched CheckinBalanceTier
	hasMatch := false
	for _, tier := range tiers {
		if tier.MinBalance < lowest.MinBalance {
			lowest = tier
		}
		if tier.MinBalance <= balance && (!hasMatch || tier.MinBalance > matched.MinBalance) {
			matched = tier
			hasMatch = true
		}
	}
	if hasMatch {
		return matched
	}
	return lowest
}

func randomCheckinReward(min, max int, randomIntn func(int) int) (int, error) {
	if err := validateCheckinQuota("reward minimum", min); err != nil {
		return 0, err
	}
	if err := validateCheckinQuota("reward maximum", max); err != nil {
		return 0, err
	}
	if min > max {
		return 0, fmt.Errorf("reward minimum must not exceed reward maximum")
	}
	if min == max {
		return min, nil
	}

	span := int64(max) - int64(min) + 1
	if span <= 0 || span > int64(math.MaxInt) {
		return 0, fmt.Errorf("reward range is too large")
	}
	if randomIntn == nil {
		randomIntn = rand.Intn
	}
	offset := randomIntn(int(span))
	if offset < 0 || int64(offset) >= span {
		return 0, fmt.Errorf("random reward source returned an invalid value")
	}
	return min + offset, nil
}

func validateCheckinQuota(name string, quota int) error {
	if quota < 0 || quota > common.MaxQuota {
		return fmt.Errorf("%s must be between 0 and %d", name, common.MaxQuota)
	}
	return nil
}

func parseCheckinQuota(value string) (int, error) {
	trimmed := strings.TrimSpace(value)
	parsed, err := strconv.ParseInt(trimmed, 10, 64)
	if err != nil {
		floatValue, floatErr := strconv.ParseFloat(trimmed, 64)
		if floatErr != nil || math.IsNaN(floatValue) || math.IsInf(floatValue, 0) || math.Trunc(floatValue) != floatValue || floatValue > math.MaxInt64 || floatValue < math.MinInt64 {
			return 0, fmt.Errorf("must be an integer")
		}
		parsed = int64(floatValue)
	}
	if parsed < 0 || parsed > int64(common.MaxQuota) {
		return 0, fmt.Errorf("must be between 0 and %d", common.MaxQuota)
	}
	return int(parsed), nil
}
