package service

import (
	"math"
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
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
