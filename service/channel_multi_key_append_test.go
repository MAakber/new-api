package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAppendChannelKeysConvertsSingleChannelToMultiKey(t *testing.T) {
	db := setupChannelMutationDB(t, false)
	created, err := CreateChannels([]model.Channel{{
		Key:    " old-key ",
		Models: "gpt-test",
		Group:  "default",
		Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	result, err := UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: "\nnew-key\nold-key\nnew-key\n"},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyModeAppend,
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.NoError(t, err)
	require.True(t, result.ConfigChanged)

	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	assert.Equal(t, "old-key\nnew-key", stored.Key)
	assert.True(t, stored.ChannelInfo.IsMultiKey)
	assert.Equal(t, 2, stored.ChannelInfo.MultiKeySize)
	assert.Equal(t, constant.MultiKeyModeRandom, stored.ChannelInfo.MultiKeyMode)
	assert.EqualValues(t, 2, stored.ConfigRevision)
}

func TestAppendChannelKeysDeduplicatesWithoutConvertingSingleChannel(t *testing.T) {
	db := setupChannelMutationDB(t, false)
	created, err := CreateChannels([]model.Channel{{
		Key:    "old-key",
		Models: "gpt-test",
		Group:  "default",
		Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	result, err := UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: "\n old-key \nold-key\n"},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyModeAppend,
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.NoError(t, err)
	assert.False(t, result.ConfigChanged)

	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	assert.Equal(t, "old-key", stored.Key)
	assert.False(t, stored.ChannelInfo.IsMultiKey)
	assert.Equal(t, 0, stored.ChannelInfo.MultiKeySize)
	assert.EqualValues(t, 1, stored.ConfigRevision)
}

func TestAppendChannelKeysRejectsInvalidModeAndStaleRevision(t *testing.T) {
	setupChannelMutationDB(t, false)
	created, err := CreateChannels([]model.Channel{{
		Key:    "old-key",
		Models: "gpt-test",
		Group:  "default",
		Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: "new-key"},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyMode("invalid"),
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.ErrorIs(t, err, ErrInvalidChannelKeyMode)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: "new-key"},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyModeAppend,
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: "later-key"},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyModeAppend,
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.ErrorIs(t, err, ErrChannelMutationRevisionConflict)
}

func TestAppendChannelKeysRejectsTypeChangeInSamePatch(t *testing.T) {
	setupChannelMutationDB(t, false)
	created, err := CreateChannels([]model.Channel{{
		Type: constant.ChannelTypeOpenAI, Key: "old-key", Models: "gpt-test", Group: "default", Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID: created[0].Id, ExpectedRevision: created[0].ConfigRevision,
		Patch:  model.Channel{Type: constant.ChannelTypeGemini, Key: "new-key"},
		Fields: map[string]bool{"type": true, "key": true}, KeyMode: ChannelKeyModeAppend,
		Trigger: ChannelMutationTriggerUpdate,
	})
	require.ErrorIs(t, err, ErrChannelMultiKeyAppendUnsupported)
}

func TestAppendChannelKeysRejectsCredentialFormatChangeInSamePatch(t *testing.T) {
	setupChannelMutationDB(t, false)
	currentSettings, err := common.Marshal(dto.ChannelOtherSettings{AwsKeyType: dto.AwsKeyTypeAKSK})
	require.NoError(t, err)
	nextSettings, err := common.Marshal(dto.ChannelOtherSettings{AwsKeyType: dto.AwsKeyTypeApiKey})
	require.NoError(t, err)
	created, err := CreateChannels([]model.Channel{{
		Type: constant.ChannelTypeAws, Key: "access|secret|region", OtherSettings: string(currentSettings),
		Models: "model", Group: "default", Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID: created[0].Id, ExpectedRevision: created[0].ConfigRevision,
		Patch:  model.Channel{Key: "api-key|region", OtherSettings: string(nextSettings)},
		Fields: map[string]bool{"key": true, "settings": true}, KeyMode: ChannelKeyModeAppend,
		Trigger: ChannelMutationTriggerUpdate,
	})
	require.ErrorIs(t, err, ErrChannelMultiKeyAppendUnsupported)
}

func TestAppendChannelKeysAcceptsExplicitDefaultCredentialFormatForLegacySettings(t *testing.T) {
	db := setupChannelMutationDB(t, false)
	nextSettings, err := common.Marshal(dto.ChannelOtherSettings{AwsKeyType: dto.AwsKeyTypeAKSK})
	require.NoError(t, err)
	created, err := CreateChannels([]model.Channel{{
		Type: constant.ChannelTypeAws, Key: "access|secret|region",
		Models: "model", Group: "default", Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID: created[0].Id, ExpectedRevision: created[0].ConfigRevision,
		Patch:  model.Channel{Key: "next-access|next-secret|region", OtherSettings: string(nextSettings)},
		Fields: map[string]bool{"key": true, "settings": true}, KeyMode: ChannelKeyModeAppend,
		Trigger: ChannelMutationTriggerUpdate,
	})
	require.NoError(t, err)

	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	assert.Equal(t, "access|secret|region\nnext-access|next-secret|region", stored.Key)
}

func TestAppendChannelKeysPreservesVertexServiceAccountJSONAndRejectsUnsupportedTypes(t *testing.T) {
	db := setupChannelMutationDB(t, false)
	vertexSettings, err := common.Marshal(dto.ChannelOtherSettings{VertexKeyType: dto.VertexKeyTypeJSON})
	require.NoError(t, err)
	created, err := CreateChannels([]model.Channel{{
		Type:          constant.ChannelTypeVertexAi,
		Key:           `{"project_id":"first","private_key":"first-key"}`,
		Other:         `{"default":"us-central1"}`,
		OtherSettings: string(vertexSettings),
		Models:        "gemini-test",
		Group:         "default",
		Status:        common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
		ChannelID:        created[0].Id,
		ExpectedRevision: created[0].ConfigRevision,
		Patch:            model.Channel{Key: `[{"project_id":"second","private_key":"second-key"}]`},
		Fields:           map[string]bool{"key": true},
		KeyMode:          ChannelKeyModeAppend,
		Trigger:          ChannelMutationTriggerUpdate,
	})
	require.NoError(t, err)

	var stored model.Channel
	require.NoError(t, db.First(&stored, created[0].Id).Error)
	require.True(t, stored.ChannelInfo.IsMultiKey)
	require.Equal(t, 2, stored.ChannelInfo.MultiKeySize)
	keys := stored.GetKeys()
	require.Len(t, keys, 2)
	for index, wantProjectID := range []string{"first", "second"} {
		var credential map[string]string
		require.NoError(t, common.Unmarshal([]byte(keys[index]), &credential))
		assert.Equal(t, wantProjectID, credential["project_id"])
	}

	apiKeySettings, err := common.Marshal(dto.ChannelOtherSettings{VertexKeyType: dto.VertexKeyTypeAPIKey})
	require.NoError(t, err)
	unsupported, err := CreateChannels([]model.Channel{{
		Type:          constant.ChannelTypeVertexAi,
		Key:           "vertex-api-key",
		Other:         `{"default":"us-central1"}`,
		OtherSettings: string(apiKeySettings),
		Models:        "gemini-test",
		Group:         "default",
		Status:        common.ChannelStatusEnabled,
	}, {
		Type:   constant.ChannelTypeCodex,
		Key:    `{"access_token":"token","account_id":"account"}`,
		Models: "gpt-test",
		Group:  "default",
		Status: common.ChannelStatusEnabled,
	}}, ChannelMutationTriggerCreate)
	require.NoError(t, err)

	for _, channel := range unsupported {
		_, err = UpdateChannelAdminPatch(ChannelAdminPatchInput{
			ChannelID:        channel.Id,
			ExpectedRevision: channel.ConfigRevision,
			Patch:            model.Channel{Key: "new-key"},
			Fields:           map[string]bool{"key": true},
			KeyMode:          ChannelKeyModeAppend,
			Trigger:          ChannelMutationTriggerUpdate,
		})
		require.ErrorIs(t, err, ErrChannelMultiKeyAppendUnsupported)
	}
}
