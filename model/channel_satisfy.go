package model

import (
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

func IsChannelEnabledForGroupModel(group string, modelName string, channelID int) bool {
	if group == "" || modelName == "" || channelID <= 0 {
		return false
	}
	if !common.MemoryCacheEnabled {
		return isChannelEnabledForGroupModelDB(group, modelName, channelID)
	}

	channelSyncLock.RLock()
	defer channelSyncLock.RUnlock()

	if group2model2channels == nil {
		return false
	}

	for _, name := range ratio_setting.RoutingModelNames(modelName) {
		if isChannelIDInList(group2model2channels[group][name], channelID) {
			return true
		}
	}
	return false
}

func IsChannelEnabledForAnyGroupModel(groups []string, modelName string, channelID int) bool {
	if len(groups) == 0 {
		return false
	}
	for _, g := range groups {
		if IsChannelEnabledForGroupModel(g, modelName, channelID) {
			return true
		}
	}
	return false
}

func isChannelEnabledForGroupModelDB(group string, modelName string, channelID int) bool {
	for _, name := range ratio_setting.RoutingModelNames(modelName) {
		var count int64
		err := DB.Model(&Ability{}).
			Where(commonGroupCol+" = ? and model = ? and channel_id = ? and enabled = ?", group, name, channelID, true).
			Count(&count).Error
		if err != nil {
			return false
		}
		if count > 0 {
			return true
		}
	}
	return false
}

func isChannelIDInList(list []int, channelID int) bool {
	return slices.Contains(list, channelID)
}
