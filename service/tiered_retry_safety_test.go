package service

import (
	"math"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	apiTypes "github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTieredRetryRejectsInvalidPriceBeforeChangingReservation(t *testing.T) {
	for _, test := range []struct {
		name    string
		ratio   float64
		clamped bool
	}{
		{name: "negative price", ratio: -1},
		{name: "request overflow", ratio: 10000, clamped: true},
		{name: "not a number", ratio: math.NaN(), clamped: true},
		{name: "infinite price", ratio: math.Inf(1), clamped: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			billing := &recordingBillingSettler{preConsumedQuota: 50_000}
			snapshot := &billingexpr.BillingSnapshot{
				BillingMode: "tiered_expr", ExprString: `tier("base", p)`,
				GroupRatio: 0.1, EstimatedQuotaBeforeGroup: 500_000,
				EstimatedQuotaAfterGroup: 50_000, QuotaPerUnit: testQuotaPerUnit,
			}
			previousSnapshot := *snapshot
			info := &relaycommon.RelayInfo{
				Billing: billing, FinalPreConsumedQuota: 50_000,
				TieredBillingSnapshot: snapshot,
				PriceData:             types.PriceData{GroupRatioInfo: types.GroupRatioInfo{GroupRatio: test.ratio}},
			}
			apiErr := PrepareTieredBillingForSelectedGroup(nil, info)
			require.NotNil(t, apiErr)
			assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
			assert.Equal(t, apiTypes.ErrorCodeModelPriceError, apiErr.GetErrorCode())
			assert.Empty(t, billing.reserveTargets)
			assert.Equal(t, 50_000, info.FinalPreConsumedQuota)
			assert.Equal(t, previousSnapshot, *info.TieredBillingSnapshot)
			if test.clamped {
				var clamp *common.QuotaClamp
				require.ErrorAs(t, apiErr, &clamp)
				assert.Same(t, clamp, info.QuotaClamp, "keep request-correlated saturation diagnostics")
			}
		})
	}
}

func TestRetryReservationKeepsSubscriptionHardCap(t *testing.T) {
	truncate(t)
	seedSubscription(t, 710, 710, 60, 50)
	info := &relaycommon.RelayInfo{UserId: 710, IsPlayground: true, FinalPreConsumedQuota: 50}
	session := &BillingSession{
		relayInfo: info, preConsumedQuota: 50,
		funding: &SubscriptionFunding{subscriptionId: 710, preConsumed: 50},
	}
	err := session.Reserve(70)
	require.Error(t, err)
	assert.Equal(t, 50, session.GetPreConsumedQuota())
	assert.Equal(t, 50, info.FinalPreConsumedQuota)
	var sub model.UserSubscription
	require.NoError(t, model.DB.First(&sub, 710).Error)
	assert.EqualValues(t, 50, sub.AmountUsed)
}

func TestRetryReservationRestoresFundingWhenTokenCannotReserve(t *testing.T) {
	for _, source := range []string{BillingSourceWallet, BillingSourceSubscription} {
		t.Run(source, func(t *testing.T) {
			truncate(t)
			seedUser(t, 711, 100)
			seedToken(t, 711, 711, "retry-token-exhausted", 0)
			seedSubscription(t, 711, 711, 100, 50)
			info := &relaycommon.RelayInfo{
				UserId: 711, TokenId: 711, TokenKey: "retry-token-exhausted", FinalPreConsumedQuota: 50,
			}
			var funding FundingSource = &WalletFunding{userId: 711, consumed: 50}
			if source == BillingSourceSubscription {
				funding = &SubscriptionFunding{subscriptionId: 711, preConsumed: 50}
			}
			session := &BillingSession{relayInfo: info, funding: funding, preConsumedQuota: 50}
			require.Error(t, session.Reserve(70))
			assert.Equal(t, 50, session.GetPreConsumedQuota())
			assert.Equal(t, 50, info.FinalPreConsumedQuota)
			var user model.User
			var sub model.UserSubscription
			var token model.Token
			require.NoError(t, model.DB.First(&user, 711).Error)
			require.NoError(t, model.DB.First(&sub, 711).Error)
			require.NoError(t, model.DB.First(&token, 711).Error)
			assert.Equal(t, 100, user.Quota)
			assert.EqualValues(t, 50, sub.AmountUsed)
			assert.Zero(t, token.RemainQuota)
			assert.Zero(t, token.UsedQuota)
		})
	}
}
