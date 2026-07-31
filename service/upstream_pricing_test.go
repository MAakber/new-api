package service

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestValidatePricingSourceDescriptorAndSanitize(t *testing.T) {
	_, err := ValidatePricingSourceDescriptor(PricingSourceDescriptor{Kind: PricingSourceRealChannel, ChannelID: 1, ResolvedBaseURL: "https://user:secret@example.com/path"})
	require.Error(t, err)
	_, err = ValidatePricingSourceDescriptor(PricingSourceDescriptor{Kind: PricingSourceRealChannel, ChannelID: 1, ResolvedBaseURL: "https://example.com", Endpoint: "pricing"})
	require.Error(t, err)
	modelsDev, err := ValidatePricingSourceDescriptor(PricingSourceDescriptor{Kind: PricingSourceModelsDev})
	require.NoError(t, err)
	require.Equal(t, -101, modelsDev.ChannelID)
	require.Equal(t, "/api.json", modelsDev.Endpoint)
	official, err := ValidatePricingSourceDescriptor(PricingSourceDescriptor{Kind: PricingSourceOfficial, ResolvedBaseURL: "https://attacker.example", Endpoint: "https://attacker.example/pricing", EndpointMode: "openrouter"})
	require.NoError(t, err)
	require.Equal(t, -100, official.ChannelID)
	require.Equal(t, officialPricingBaseURL, official.ResolvedBaseURL)
	require.Equal(t, officialPricingEndpoint, official.Endpoint)
	require.Empty(t, official.EndpointMode)
	safe := SanitizePricingError(assertError("https://user:secret@example.com/path?q=key Authorization: Bearer abc"))
	require.NotContains(t, safe, "secret")
	require.NotContains(t, safe, "abc")
	safe = SanitizePricingError(assertError("Authorization: Basic dXNlcjpzZWNyZXQ= api_key=top-secret"))
	require.NotContains(t, safe, "dXNlcjpzZWNyZXQ=")
	require.NotContains(t, safe, "top-secret")
}

func TestParseModelsDevPricingIsDeterministicAndRejectsNegativeAuxiliaries(t *testing.T) {
	body := []byte(`{"z":{"models":{"same":{"cost":{"input":0,"output":-1,"cache_read":-1}},"zero-with-output":{"cost":{"input":0,"output":1}},"valid":{"cost":{"input":2}}}},"a":{"models":{"same":{"cost":{"input":1,"output":0,"cache_read":0}},"zero-with-output":{"cost":{"input":2}},"valid":{"cost":{"input":3}}}}}`)
	pricing, err := parseModelsDevPricing(body)
	require.NoError(t, err)
	require.Equal(t, float64(0.5), pricing.ModelRatio["same"])
	require.Equal(t, float64(0), pricing.CompletionRatio["same"])
	require.Equal(t, float64(0), pricing.CacheRatio["same"])
	require.Equal(t, float64(1), pricing.ModelRatio["valid"])
	require.Equal(t, float64(1), pricing.ModelRatio["zero-with-output"])

	// The reversed provider ordering must select exactly the same candidates.
	reversed, err := parseModelsDevPricing([]byte(`{"a":{"models":{"same":{"cost":{"input":1,"output":0,"cache_read":0}},"zero-with-output":{"cost":{"input":2}},"valid":{"cost":{"input":3}}}},"z":{"models":{"same":{"cost":{"input":0,"output":-1,"cache_read":-1}},"zero-with-output":{"cost":{"input":0,"output":1}},"valid":{"cost":{"input":2}}}}}`))
	require.NoError(t, err)
	require.Equal(t, pricing, reversed)
}

func TestVerifyRealPricingChannelSnapshot(t *testing.T) {
	base := "https://pricing.example"
	source := PricingSourceDescriptor{Kind: PricingSourceRealChannel, ChannelID: 1, ChannelType: 20, ResolvedBaseURL: base}
	snapshot := &model.Channel{Id: 1, Type: 20, BaseURL: &base}
	require.NoError(t, verifyRealPricingChannelSnapshot(source, snapshot))
	snapshot.Type = 1
	require.Error(t, verifyRealPricingChannelSnapshot(source, snapshot))
}

func TestParseOpenRouterPricingCacheAndNegativeValues(t *testing.T) {
	pricing, err := parseOpenRouterPricing([]byte(`{"data":[{"id":"valid","pricing":{"prompt":"0.001","completion":"0.002","input_cache_read":"0"}},{"id":"negative-cache","pricing":{"prompt":"0.001","completion":"0.002","input_cache_read":"-1"}},{"id":"negative-output","pricing":{"prompt":"0.001","completion":"-1"}}]}`))
	require.NoError(t, err)
	require.Equal(t, float64(0), pricing.CacheRatio["valid"])
	_, hasNegativeCache := pricing.CacheRatio["negative-cache"]
	require.False(t, hasNegativeCache)
	_, hasNegativeOutput := pricing.ModelRatio["negative-output"]
	require.False(t, hasNegativeOutput)
}

func TestParseStandardPricingPreservesType2AuxiliaryZeroAndTieredMode(t *testing.T) {
	normalized, err := parseStandardPricing([]byte(`{"success":true,"data":[{"model_name":"tiered","quota_type":0,"model_ratio":3,"completion_ratio":2,"cache_ratio":0,"create_cache_ratio":0,"image_ratio":0,"audio_ratio":0,"audio_completion_ratio":0,"billing_mode":"tiered_expr","billing_expr":"input*2"}]}`))
	require.NoError(t, err)
	require.Equal(t, float64(0), normalized.CacheRatio["tiered"])
	require.Equal(t, float64(0), normalized.CreateCacheRatio["tiered"])
	require.Equal(t, float64(0), normalized.ImageRatio["tiered"])
	require.Equal(t, float64(0), normalized.AudioRatio["tiered"])
	require.Equal(t, float64(0), normalized.AudioCompletionRatio["tiered"])
	require.Equal(t, "tiered_expr", normalized.BillingMode["tiered"])

	normalized, err = parseStandardPricing([]byte(`{"success":true,"data":{"model_ratio":{"ratio-model":1},"completion_ratio":{"ratio-model":0},"cache_ratio":{"ratio-model":0},"billing_mode":{"ratio-model":"ratio"}}}`))
	require.NoError(t, err)
	require.Equal(t, float64(1), normalized.ModelRatio["ratio-model"])
	require.Equal(t, float64(0), normalized.CompletionRatio["ratio-model"])
	require.Equal(t, "ratio", normalized.BillingMode["ratio-model"])
}

func TestBuildMissingPricingPatchUsesCanonicalDBRows(t *testing.T) {
	db := usePricingPatchDB(t)
	require.NoError(t, db.Model(&model.Option{}).Where("key = ?", "ModelPrice").Update("value", `{"already":0}`).Error)
	operations, err := BuildMissingPricingPatch([]string{"missing", "already", "missing"}, NormalizedPricing{
		ModelPrice:      map[string]float64{"missing": 0, "already": 1},
		CompletionRatio: map[string]float64{"missing": 2},
		CacheRatio:      map[string]float64{"missing": 0.5},
	})
	require.NoError(t, err)
	var targets []string
	for _, operation := range operations {
		targets = append(targets, operation.Key+":"+operation.Model)
		require.Equal(t, PricingPatchSetIfMissing, operation.Action)
		require.NotEqual(t, "billing_setting.billing_mode", operation.Key)
	}
	require.Contains(t, targets, "ModelPrice:missing")
	require.NotContains(t, targets, "ModelPrice:already")
	require.Contains(t, targets, "CompletionRatio:missing")

	tiered, err := BuildMissingPricingPatch([]string{"tiered"}, NormalizedPricing{ModelRatio: map[string]float64{"tiered": 1}, BillingMode: map[string]string{"tiered": "tiered_expr"}})
	require.NoError(t, err)
	// A tiered source cannot create a base pricing operation.
	for _, operation := range tiered {
		require.NotEqual(t, "ModelRatio", operation.Key)
	}
}

type assertError string

func (e assertError) Error() string { return string(e) }
