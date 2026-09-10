package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdvancedCustomBalancePreservesStoredValueUnlessSummaryRecognized(t *testing.T) {
	for _, tt := range []struct {
		name, body, wantError string
		wantRaw               bool
		wantBalance           float64
	}{
		{name: "credit summary", body: `{"object":"credit_summary","total_available":12.5}`, wantBalance: 12.5},
		{name: "zero balance", body: `{"object":"credit_summary","total_available":0}`},
		{name: "unrecognized JSON", body: `{"data":{"balance":"12.5"}}`, wantRaw: true, wantBalance: 42},
		{name: "negative summary", body: `{"object":"credit_summary","total_available":-1}`, wantRaw: true, wantBalance: 42},
		{name: "malformed response", body: `not JSON`, wantError: "invalid balance JSON response", wantBalance: 42},
		{name: "oversized response", body: strings.Repeat(" ", maxAdvancedCustomBalanceResponseBytes+1), wantError: "balance response exceeds", wantBalance: 42},
	} {
		t.Run(tt.name, func(t *testing.T) {
			db := usePricingControllerDB(t)
			require.NoError(t, db.AutoMigrate(&model.Channel{}))
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, http.MethodGet, r.Method)
				assert.Equal(t, "/provider/balance", r.URL.Path)
				assert.Equal(t, "prefix-fixture-key", r.URL.Query().Get("token"))
				assert.Equal(t, "channel-header", r.Header.Get("X-Probe"))
				assert.Empty(t, r.Header.Get("Authorization"))
				_, _ = io.WriteString(w, tt.body)
			}))
			t.Cleanup(server.Close)
			headers := `{"X-Probe":"channel-header"}`
			channel := &model.Channel{Type: constant.ChannelTypeAdvancedCustom, Key: "fixture-key", BaseURL: &server.URL, Balance: 42, HeaderOverride: &headers}
			channel.SetOtherSettings(dto.ChannelOtherSettings{AdvancedCustom: &dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{{
				IncomingPath: dto.AdvancedCustomBalancePath,
				UpstreamPath: "/provider/balance",
				Auth:         &dto.AdvancedCustomRouteAuth{Type: dto.AdvancedCustomAuthTypeQuery, Name: "token", Value: "prefix-{api_key}"},
			}}}})
			require.NoError(t, db.Create(channel).Error)
			result, err := updateChannelBalance(channel)
			if tt.wantError != "" {
				require.ErrorContains(t, err, tt.wantError)
			} else {
				require.NoError(t, err)
				if tt.wantRaw {
					assert.JSONEq(t, tt.body, result.RawResponse)
				} else {
					assert.Empty(t, result.RawResponse)
					assert.Equal(t, tt.wantBalance, result.Balance)
				}
			}
			var stored model.Channel
			require.NoError(t, db.First(&stored, channel.Id).Error)
			assert.Equal(t, tt.wantBalance, stored.Balance)
		})
	}
}
