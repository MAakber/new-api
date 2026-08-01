package controller

import (
	"bytes"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWriteRedemptionsCSVIncludesBOMAndManagementFields(t *testing.T) {
	redemption := &model.Redemption{
		Id:                     7,
		Name:                   "套餐,测试",
		RewardType:             model.RedemptionRewardTypeSubscription,
		Key:                    "12345678901234567890123456789012",
		PlanId:                 3,
		PlanTitle:              "专业套餐",
		Status:                 common.RedemptionCodeStatusUsed,
		CreatedTime:            1_700_000_000,
		RedeemedTime:           1_700_000_100,
		UsedUserId:             11,
		RedeemedSubscriptionId: 13,
	}

	var output bytes.Buffer
	require.NoError(t, writeRedemptionsCSV(&output, []*model.Redemption{redemption}))
	require.True(t, bytes.HasPrefix(output.Bytes(), []byte{0xEF, 0xBB, 0xBF}))

	reader := csv.NewReader(strings.NewReader(string(output.Bytes()[3:])))
	records, err := reader.ReadAll()
	require.NoError(t, err)
	require.Len(t, records, 2)
	assert.Equal(t, "Code", records[0][3])
	assert.Equal(t, redemption.Name, records[1][1])
	assert.Equal(t, redemption.Key, records[1][3])
	assert.Equal(t, "3", records[1][5])
	assert.Equal(t, redemption.PlanTitle, records[1][6])
	assert.Equal(t, "used", records[1][7])
	assert.Equal(t, "11", records[1][11])
	assert.Equal(t, "13", records[1][12])
}

func TestValidateRedemptionStatusUpdateRejectsUsedAndUnknownStatuses(t *testing.T) {
	require.Error(t, validateRedemptionStatusUpdate(
		common.RedemptionCodeStatusUsed,
		common.RedemptionCodeStatusEnabled,
	))
	require.Error(t, validateRedemptionStatusUpdate(
		common.RedemptionCodeStatusEnabled,
		common.RedemptionCodeStatusUsed,
	))
	require.NoError(t, validateRedemptionStatusUpdate(
		common.RedemptionCodeStatusEnabled,
		common.RedemptionCodeStatusDisabled,
	))
}
