package service

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupChannelMutationDB(t *testing.T, withEvents bool) *gorm.DB {
	t.Helper()
	db := usePricingPatchDB(t)
	require.NoError(t, db.AutoMigrate(&model.Channel{}, &model.Ability{}, &model.AutoPriceGuard{}))
	if withEvents {
		require.NoError(t, db.AutoMigrate(&model.AutoSyncEvent{}, &model.AutoSyncCursor{}))
	}
	return db
}

func enableMutationSync(t *testing.T, db *gorm.DB) {
	t.Helper()
	source, err := json.Marshal(PricingSourceDescriptor{Kind: PricingSourceModelsDev})
	require.NoError(t, err)
	putAutoSyncOption(t, db, AutoPriceSyncEnabledOptionKey, "true")
	putAutoSyncOption(t, db, AutoPriceSyncSourceOptionKey, string(source))
	putAutoSyncOption(t, db, AutoModelMetadataSyncEnabledOptionKey, "true")
}

func TestChannelMutationCreatePersistsGuardAbilitiesAndEvents(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "secret-key", Name: "one", Models: "gpt,x", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	require.Len(t, created, 1)
	require.NotZero(t, created[0].Id)
	require.NotZero(t, created[0].AutoPriceGuardID)
	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	require.Equal(t, created[0].AutoPriceGuardID, stored.AutoPriceGuardID)
	var abilities, events int64
	require.NoError(t, db.Model(&model.Ability{}).Count(&abilities).Error)
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&events).Error)
	require.EqualValues(t, 2, abilities)
	require.EqualValues(t, 2, events)
	var event model.AutoSyncEvent
	require.NoError(t, db.Where("type = ?", AutoPriceSyncEventType).First(&event).Error)
	require.NotContains(t, event.Payload, "secret-key")
}

func TestChannelMutationCopyResetsRevisionAndDoesNotReuseGuard(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "source-key", Name: "source", Models: "gpt", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	source := created[0]
	require.NotZero(t, source.AutoPriceGuardID)
	source.ConfigRevision = 88 // emulate a long-lived source channel being copied.
	source.Id = 0
	source.AutoPriceGuardID = created[0].AutoPriceGuardID
	copyResult, err := CreateChannels([]model.Channel{source}, ChannelMutationTriggerCopy)
	require.NoError(t, err)
	require.NotEqual(t, created[0].Id, copyResult[0].Id)
	require.EqualValues(t, 1, copyResult[0].ConfigRevision)
	require.NotZero(t, copyResult[0].AutoPriceGuardID)
	require.NotEqual(t, created[0].AutoPriceGuardID, copyResult[0].AutoPriceGuardID)
	var stored model.Channel
	require.NoError(t, db.First(&stored, copyResult[0].Id).Error)
	require.EqualValues(t, 1, stored.ConfigRevision)
}

func TestChannelMutationCreateRollsBackWhenEventWriteFails(t *testing.T) {
	db := setupChannelMutationDB(t, false)
	putAutoSyncOption(t, db, AutoModelMetadataSyncEnabledOptionKey, "true")
	_, err := CreateChannels([]model.Channel{{Key: "secret", Models: "gpt", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.Error(t, err)
	var channels, abilities, guards int64
	require.NoError(t, db.Model(&model.Channel{}).Count(&channels).Error)
	require.NoError(t, db.Model(&model.Ability{}).Count(&abilities).Error)
	require.NoError(t, db.Model(&model.AutoPriceGuard{}).Count(&guards).Error)
	require.Zero(t, channels)
	require.Zero(t, abilities)
	require.Zero(t, guards)
}

func TestChannelMutationUpdateAndStatusRevision(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	putAutoSyncOption(t, db, AutoModelMetadataSyncEnabledOptionKey, "true")
	created, err := CreateChannels([]model.Channel{{Key: "secret", Name: "one", Models: "a", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	next := created[0]
	next.Models = "b"
	updated, err := UpdateChannel(&next, ChannelMutationTriggerUpdate)
	require.NoError(t, err)
	require.True(t, updated.ConfigChanged)
	require.True(t, updated.ModelsChanged)
	require.True(t, updated.EventsAppended)
	require.EqualValues(t, 2, updated.Updated.ConfigRevision)
	status, err := UpdateChannelStatuses([]int{created[0].Id}, common.ChannelStatusManuallyDisabled)
	require.NoError(t, err)
	require.Equal(t, 1, status.ChangedCount)
	var beforeReenable int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&beforeReenable).Error)
	status, err = UpdateChannelStatuses([]int{created[0].Id}, common.ChannelStatusEnabled)
	require.NoError(t, err)
	require.True(t, status.Channels[0].EventsAppended)
	var afterReenable int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&afterReenable).Error)
	require.EqualValues(t, 1, afterReenable-beforeReenable)
	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	require.EqualValues(t, 4, stored.ConfigRevision)
}

func TestChannelMutationTagStatusAndEdit(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{
		{Key: "secret-a", Models: "a", Group: "default", Tag: common.GetPointer("tag"), Status: common.ChannelStatusEnabled},
		{Key: "secret-b", Models: "a", Group: "default", Tag: common.GetPointer("tag"), Status: common.ChannelStatusManuallyDisabled},
	}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	var eventsBefore int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&eventsBefore).Error)
	disabled, err := UpdateChannelStatusesByTag("tag", common.ChannelStatusManuallyDisabled)
	require.NoError(t, err)
	require.Equal(t, 1, disabled.ChangedCount)
	var eventsAfterDisable int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&eventsAfterDisable).Error)
	require.Equal(t, eventsBefore, eventsAfterDisable)
	enabled, err := UpdateChannelStatusesByTag("tag", common.ChannelStatusEnabled)
	require.NoError(t, err)
	require.Equal(t, 2, enabled.ChangedCount)
	var eventsAfterEnable int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&eventsAfterEnable).Error)
	require.EqualValues(t, 4, eventsAfterEnable-eventsAfterDisable)
	mapping := `{"a":"mapping-secret"}`
	edited, err := UpdateChannelsByTag(ChannelTagMutationInput{Tag: "tag", ModelMapping: &mapping})
	require.NoError(t, err)
	require.Equal(t, 2, edited.ChangedCount)
	var priceEvents []model.AutoSyncEvent
	require.NoError(t, db.Where("type = ?", AutoPriceSyncEventType).Find(&priceEvents).Error)
	for _, event := range priceEvents {
		require.NotContains(t, event.Payload, "mapping-secret")
	}
	_, err = UpdateChannelsByTag(ChannelTagMutationInput{Tag: "missing", Models: common.GetPointer("ignored")})
	require.NoError(t, err)
	_ = created
}

func TestChannelMutationKeyConfigurationInvalidatesWithoutEvents(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "one\ntwo", Models: "a", Group: "default", Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{IsMultiKey: true, MultiKeySize: 2, MultiKeyStatusList: map[int]int{1: common.ChannelStatusAutoDisabled}, MultiKeyDisabledReason: map[int]string{1: "bad"}}}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	var before int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&before).Error)
	next := created[0]
	next.Key = "one"
	next.ChannelInfo.MultiKeySize = 1
	next.ChannelInfo.MultiKeyStatusList = map[int]int{}
	next.ChannelInfo.MultiKeyDisabledReason = map[int]string{}
	result, err := UpdateChannelKeyConfiguration(&next)
	require.NoError(t, err)
	require.True(t, result.Changed)
	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	require.EqualValues(t, 2, stored.ConfigRevision)
	require.Zero(t, stored.AutoPriceGuardID)
	var after int64
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&after).Error)
	require.Equal(t, before, after)
}

func TestChannelMutationUpstreamModelsSettingsAndConflict(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "secret", Models: "a", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	channel := created[0]
	var abilityCount, eventCount int64
	require.NoError(t, db.Model(&model.Ability{}).Count(&abilityCount).Error)
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&eventCount).Error)
	settingsOnly, err := PersistChannelUpstreamModels(PersistChannelUpstreamModelMutation{ChannelID: channel.Id, ExpectedRevision: 1, ExpectedModels: "a", ExpectedOtherSettings: "", NextModels: "a", OtherSettings: `{"last_check":1}`, Trigger: ChannelMutationTriggerUpstreamApply})
	require.NoError(t, err)
	require.False(t, settingsOnly.ModelsChanged)
	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.EqualValues(t, 1, stored.ConfigRevision)
	require.Equal(t, channel.AutoPriceGuardID, stored.AutoPriceGuardID)
	models, err := PersistChannelUpstreamModels(PersistChannelUpstreamModelMutation{ChannelID: channel.Id, ExpectedRevision: 1, ExpectedModels: "a", ExpectedOtherSettings: `{"last_check":1}`, NextModels: "b", OtherSettings: `{"last_check":2}`, Trigger: ChannelMutationTriggerUpstreamAutoApply})
	require.NoError(t, err)
	require.True(t, models.ModelsChanged)
	require.EqualValues(t, 2, models.Updated.ConfigRevision)
	var guard model.AutoPriceGuard
	require.NoError(t, db.First(&guard, channel.AutoPriceGuardID).Error)
	require.Equal(t, model.AutoPriceGuardStateInvalidated, guard.State)
	var afterAbilities, afterEvents int64
	require.NoError(t, db.Model(&model.Ability{}).Count(&afterAbilities).Error)
	require.NoError(t, db.Model(&model.AutoSyncEvent{}).Count(&afterEvents).Error)
	require.Equal(t, abilityCount, afterAbilities)
	require.EqualValues(t, 2, afterEvents-eventCount)
	var event model.AutoSyncEvent
	require.NoError(t, db.Where("trigger = ?", ChannelMutationTriggerUpstreamAutoApply).First(&event).Error)
	require.NotContains(t, event.Payload, "secret")
	_, err = PersistChannelUpstreamModels(PersistChannelUpstreamModelMutation{ChannelID: channel.Id, ExpectedRevision: 1, ExpectedModels: "a", ExpectedOtherSettings: `{"last_check":2}`, NextModels: "c", OtherSettings: `{"wrong":true}`, Trigger: ChannelMutationTriggerUpstreamApply})
	require.True(t, errors.Is(err, ErrChannelUpstreamModelsConflict))
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "b", stored.Models)
	require.Equal(t, `{"last_check":2}`, stored.OtherSettings)
}

func TestChannelMutationAdminPatchRevisionKeyAndRuntimeMultiKey(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "secret", Models: "a", Group: "default", Status: common.ChannelStatusEnabled,
		ChannelInfo: model.ChannelInfo{IsMultiKey: true, MultiKeySize: 1}}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	channel := created[0]
	// Empty key remains the historical no-op rather than a secret-clearing write.
	result, err := UpdateChannelAdminPatch(ChannelAdminPatchInput{ChannelID: channel.Id, ExpectedRevision: 1, Patch: model.Channel{Key: ""}, Fields: map[string]bool{"key": true}, Trigger: ChannelMutationTriggerUpdate})
	require.NoError(t, err)
	require.False(t, result.ConfigChanged)
	result, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{ChannelID: channel.Id, ExpectedRevision: 1, Patch: model.Channel{Key: "new-secret"}, Fields: map[string]bool{"key": true}, Trigger: ChannelMutationTriggerUpdate})
	require.NoError(t, err)
	require.True(t, result.ConfigChanged)
	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{ChannelID: channel.Id, ExpectedRevision: 1, Patch: model.Channel{Name: "stale"}, Fields: map[string]bool{"name": true}, Trigger: ChannelMutationTriggerUpdate})
	require.ErrorIs(t, err, ErrChannelMutationRevisionConflict)
	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "new-secret", stored.Key)
	require.Equal(t, "a", stored.Models)
	require.ErrorIs(t, UpdateChannelRuntimeMultiKey(ChannelRuntimeMultiKeyMutation{ChannelID: channel.Id, ExpectedRevision: 1, ChannelInfo: model.ChannelInfo{}}), ErrChannelMutationRevisionConflict)
	info := stored.ChannelInfo
	info.MultiKeyStatusList = map[int]int{0: common.ChannelStatusManuallyDisabled}
	require.NoError(t, UpdateChannelRuntimeMultiKey(ChannelRuntimeMultiKeyMutation{ChannelID: channel.Id, ExpectedRevision: stored.ConfigRevision, ChannelInfo: info}))
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.EqualValues(t, 2, stored.ConfigRevision)
	require.Equal(t, "new-secret", stored.Key)
	require.Equal(t, common.ChannelStatusManuallyDisabled, stored.ChannelInfo.MultiKeyStatusList[0])
}

func TestChannelMutationBatchTagInvalidatesGuardAndUpdatesAbilities(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "secret", Models: "a", Group: "default", Tag: common.GetPointer("old"), Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	changed, err := BatchSetChannelTags([]int{created[0].Id, created[0].Id}, common.GetPointer("new"))
	require.NoError(t, err)
	require.Equal(t, 1, changed)
	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	require.Equal(t, "new", stored.GetTag())
	require.EqualValues(t, 2, stored.ConfigRevision)
	require.Zero(t, stored.AutoPriceGuardID)
	var ability model.Ability
	require.NoError(t, db.First(&ability, "channel_id = ?", stored.Id).Error)
	require.Equal(t, "new", *ability.Tag)
}

func TestChannelMutationUpstreamSnapshotConflictsDoNotWrite(t *testing.T) {
	db := setupChannelMutationDB(t, true)
	enableMutationSync(t, db)
	created, err := CreateChannels([]model.Channel{{Key: "secret", Models: "a", Group: "default", Status: common.ChannelStatusEnabled}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)
	channel := created[0]
	input := PersistChannelUpstreamModelMutation{ChannelID: channel.Id, ExpectedRevision: channel.ConfigRevision, ExpectedModels: channel.Models, ExpectedOtherSettings: channel.OtherSettings, NextModels: "b", OtherSettings: `{"new":true}`, Trigger: ChannelMutationTriggerUpstreamApply}
	// Runtime settings may change without a config revision; it is still a CAS conflict.
	require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", channel.Id).Update("settings", `{"concurrent":true}`).Error)
	_, err = PersistChannelUpstreamModels(input)
	require.ErrorIs(t, err, ErrChannelUpstreamModelsConflict)
	var stored model.Channel
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "a", stored.Models)
	require.Equal(t, `{"concurrent":true}`, stored.OtherSettings)
	require.EqualValues(t, 1, stored.ConfigRevision)
	// A configuration edit followed by a value revert retains a higher revision.
	next := stored
	base := "https://changed.example"
	next.BaseURL = &base
	_, err = UpdateChannel(&next, ChannelMutationTriggerUpdate)
	require.NoError(t, err)
	next.BaseURL = nil
	_, err = UpdateChannel(&next, ChannelMutationTriggerUpdate)
	require.NoError(t, err)
	_, err = PersistChannelUpstreamModels(input)
	require.ErrorIs(t, err, ErrChannelUpstreamModelsConflict)
	require.NoError(t, db.First(&stored, channel.Id).Error)
	require.Equal(t, "a", stored.Models)
	require.Equal(t, `{"concurrent":true}`, stored.OtherSettings)
}
