package service

// This file is intentionally independent of the HTTP controller.  Scheduled
// jobs can persist PricingSourceDescriptor safely (it never contains a key) and
// use the same normal form as the interactive ratio-sync flow.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"gorm.io/gorm"
)

type PricingSourceKind string

const (
	PricingSourceRealChannel  PricingSourceKind = "real_channel"
	PricingSourceOfficial     PricingSourceKind = "official"
	PricingSourceModelsDev    PricingSourceKind = "models_dev"
	PricingEndpointOpenRouter                   = "openrouter"
	officialPricingBaseURL                      = "https://basellm.github.io"
	officialPricingEndpoint                     = "/llm-metadata/api/newapi/ratio_config-v1-base.json"
	modelsDevPricingBaseURL                     = "https://models.dev"
	modelsDevPricingEndpoint                    = "/api.json"
)

// PricingSourceDescriptor is safe to persist in an event/task payload.
type PricingSourceDescriptor struct {
	Kind            PricingSourceKind `json:"kind"`
	ChannelID       int               `json:"channel_id,omitempty"`
	ChannelType     int               `json:"channel_type,omitempty"`
	ResolvedBaseURL string            `json:"resolved_base_url"`
	EndpointMode    string            `json:"endpoint_mode,omitempty"`
	Endpoint        string            `json:"endpoint,omitempty"`
}

type NormalizedPricing struct {
	ModelPrice           map[string]float64 `json:"model_price,omitempty"`
	ModelRatio           map[string]float64 `json:"model_ratio,omitempty"`
	CompletionRatio      map[string]float64 `json:"completion_ratio,omitempty"`
	CacheRatio           map[string]float64 `json:"cache_ratio,omitempty"`
	CreateCacheRatio     map[string]float64 `json:"create_cache_ratio,omitempty"`
	ImageRatio           map[string]float64 `json:"image_ratio,omitempty"`
	AudioRatio           map[string]float64 `json:"audio_ratio,omitempty"`
	AudioCompletionRatio map[string]float64 `json:"audio_completion_ratio,omitempty"`
	BillingMode          map[string]string  `json:"billing_mode,omitempty"`
}

var sensitivePricingError = regexp.MustCompile(`(?i)(authorization\s*[:=]?\s*(?:(?:bearer|basic)\s+)?|bearer\s+|basic\s+|api[_ -]?key\s*[:=]?)[^\s,;]+`)

func SanitizePricingError(err error) string {
	if err == nil {
		return ""
	}
	s := sensitivePricingError.ReplaceAllString(err.Error(), "$1[redacted]")
	for _, match := range regexp.MustCompile(`https?://[^\s]+`).FindAllString(s, -1) {
		if u, parseErr := url.Parse(match); parseErr == nil {
			u.User, u.RawQuery, u.Fragment = nil, "", ""
			s = strings.ReplaceAll(s, match, u.String())
		}
	}
	if len(s) > 512 {
		s = s[:512]
	}
	return s
}

func ValidatePricingSourceDescriptor(source PricingSourceDescriptor) (PricingSourceDescriptor, error) {
	if source.Kind == PricingSourceOfficial {
		// These are a closed preset, not user-controlled descriptor fields.
		source.ChannelID, source.ResolvedBaseURL, source.Endpoint, source.EndpointMode = -100, officialPricingBaseURL, officialPricingEndpoint, ""
	}
	if source.Kind == PricingSourceModelsDev {
		source.ChannelID, source.ResolvedBaseURL, source.Endpoint, source.EndpointMode = -101, modelsDevPricingBaseURL, modelsDevPricingEndpoint, ""
	}
	if source.Kind != PricingSourceRealChannel && source.Kind != PricingSourceOfficial && source.Kind != PricingSourceModelsDev {
		return source, errors.New("invalid pricing source kind")
	}
	if source.Kind == PricingSourceRealChannel && source.ChannelID <= 0 {
		return source, errors.New("real pricing source requires channel id")
	}
	u, err := url.Parse(source.ResolvedBaseURL)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return source, errors.New("resolved base URL must be a clean HTTPS URL")
	}
	source.ResolvedBaseURL = strings.TrimRight(u.String(), "/")
	if source.Endpoint != "" && source.Endpoint != PricingEndpointOpenRouter {
		if strings.HasPrefix(source.Endpoint, "http://") || strings.HasPrefix(source.Endpoint, "https://") {
			e, eerr := url.Parse(source.Endpoint)
			if eerr != nil || e.Scheme != "https" || e.Host == "" || e.User != nil || e.RawQuery != "" || e.ForceQuery || e.Fragment != "" {
				return source, errors.New("pricing endpoint must be a clean HTTPS URL")
			}
			source.Endpoint = e.String()
		} else {
			e, eerr := url.Parse(source.Endpoint)
			if eerr != nil || !strings.HasPrefix(e.Path, "/") || e.User != nil || e.RawQuery != "" || e.ForceQuery || e.Fragment != "" {
				return source, errors.New("relative pricing endpoint must be a clean absolute path")
			}
			source.Endpoint = e.Path
		}
	}
	return source, nil
}

func FetchNormalizedPricing(ctx context.Context, source PricingSourceDescriptor, timeout time.Duration) (NormalizedPricing, error) {
	source, err := ValidatePricingSourceDescriptor(source)
	if err != nil {
		return NormalizedPricing{}, err
	}
	var channelSnapshot *model.Channel
	if source.Kind == PricingSourceRealChannel {
		channel, channelErr := model.GetChannelById(source.ChannelID, true)
		if channelErr != nil {
			return NormalizedPricing{}, fmt.Errorf("get pricing channel: %w", channelErr)
		}
		if err := verifyRealPricingChannelSnapshot(source, channel); err != nil {
			return NormalizedPricing{}, errors.New("pricing source no longer matches channel configuration")
		}
		channelSnapshot = channel
		currentBase, _ := canonicalPricingHTTPSURL(channel.GetBaseURL())
		if strings.HasPrefix(source.Endpoint, "https://") {
			endpointURL, _ := url.Parse(source.Endpoint)
			baseURL, _ := url.Parse(currentBase)
			if endpointURL.Scheme != baseURL.Scheme || endpointURL.Host != baseURL.Host {
				return NormalizedPricing{}, errors.New("channel pricing endpoint must remain on the configured host")
			}
		}
	}
	endpoint := source.Endpoint
	if endpoint == "" {
		endpoint = "/api/pricing"
	}
	fullURL := source.ResolvedBaseURL + endpoint
	if endpoint == PricingEndpointOpenRouter {
		fullURL = source.ResolvedBaseURL + "/v1/models"
	}
	if strings.HasPrefix(endpoint, "https://") {
		fullURL = endpoint
	}
	if timeout <= 0 {
		timeout = 10 * time.Second
	}
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, fullURL, nil)
	if err != nil {
		return NormalizedPricing{}, err
	}
	if endpoint == PricingEndpointOpenRouter {
		if source.Kind != PricingSourceRealChannel {
			return NormalizedPricing{}, errors.New("OpenRouter requires a real channel")
		}
		// Use the exact snapshot already verified above. A second database read
		// here would let a channel URL/type change race key acquisition.
		key, _, apiErr := channelSnapshot.GetNextEnabledKey()
		if apiErr != nil || strings.TrimSpace(key) == "" {
			return NormalizedPricing{}, errors.New("no enabled channel key")
		}
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(key))
	}
	client := &http.Client{CheckRedirect: func(redirect *http.Request, via []*http.Request) error {
		if redirect.URL.Scheme != "https" {
			return errors.New("pricing redirect downgraded HTTPS")
		}
		if endpoint == PricingEndpointOpenRouter && (redirect.URL.Scheme != via[0].URL.Scheme || redirect.URL.Host != via[0].URL.Host) {
			return errors.New("OpenRouter redirect changed origin")
		}
		return nil
	}}
	var response *http.Response
	for attempt := 0; attempt < 3; attempt++ {
		response, err = client.Do(req)
		if err == nil {
			break
		}
		select {
		case <-requestCtx.Done():
			return NormalizedPricing{}, requestCtx.Err()
		case <-time.After(time.Duration(200*(1<<attempt)) * time.Millisecond):
		}
	}
	if err != nil {
		return NormalizedPricing{}, fmt.Errorf("pricing fetch: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return NormalizedPricing{}, fmt.Errorf("pricing fetch status: %s", response.Status)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 10<<20))
	if err != nil {
		return NormalizedPricing{}, err
	}
	if endpoint == PricingEndpointOpenRouter {
		return parseOpenRouterPricing(body)
	}
	if source.Kind == PricingSourceModelsDev {
		return parseModelsDevPricing(body)
	}
	return parseStandardPricing(body)
}

// verifyRealPricingChannelSnapshot keeps descriptor validation separate from
// fetching so the one DB-loaded channel can be both checked and used for auth.
func verifyRealPricingChannelSnapshot(source PricingSourceDescriptor, channel *model.Channel) error {
	if channel == nil || channel.Type != source.ChannelType {
		return errors.New("channel type changed")
	}
	currentBase, err := canonicalPricingHTTPSURL(channel.GetBaseURL())
	if err != nil || currentBase != source.ResolvedBaseURL {
		return errors.New("channel base URL changed")
	}
	return nil
}

func canonicalPricingHTTPSURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", errors.New("invalid channel pricing base URL")
	}
	return strings.TrimRight(u.String(), "/"), nil
}

func parseStandardPricing(body []byte) (NormalizedPricing, error) {
	var envelope struct {
		Success bool            `json:"success"`
		Data    json.RawMessage `json:"data"`
		Message string          `json:"message"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		return NormalizedPricing{}, err
	}
	if !envelope.Success {
		return NormalizedPricing{}, errors.New(SanitizePricingError(errors.New(envelope.Message)))
	}
	// ratio_config uses the same {success,data} envelope as GetRatioConfig.
	// Its data is a heterogeneous object: numeric maps plus string billing maps.
	var rawMaps map[string]json.RawMessage
	if json.Unmarshal(envelope.Data, &rawMaps) == nil && (rawMaps["model_ratio"] != nil || rawMaps["model_price"] != nil) {
		decodeNumeric := func(key string) map[string]float64 {
			var values map[string]float64
			if json.Unmarshal(rawMaps[key], &values) != nil {
				return nil
			}
			return values
		}
		var billingModes map[string]string
		_ = json.Unmarshal(rawMaps[billing_setting.BillingModeField], &billingModes)
		return NormalizedPricing{ModelPrice: decodeNumeric("model_price"), ModelRatio: decodeNumeric("model_ratio"), CompletionRatio: decodeNumeric("completion_ratio"), CacheRatio: decodeNumeric("cache_ratio"), CreateCacheRatio: decodeNumeric("create_cache_ratio"), ImageRatio: decodeNumeric("image_ratio"), AudioRatio: decodeNumeric("audio_ratio"), AudioCompletionRatio: decodeNumeric("audio_completion_ratio"), BillingMode: billingModes}, nil
	}
	var items []struct {
		ModelName            string   `json:"model_name"`
		QuotaType            int      `json:"quota_type"`
		ModelRatio           float64  `json:"model_ratio"`
		ModelPrice           float64  `json:"model_price"`
		CompletionRatio      float64  `json:"completion_ratio"`
		CacheRatio           *float64 `json:"cache_ratio"`
		CreateCacheRatio     *float64 `json:"create_cache_ratio"`
		ImageRatio           *float64 `json:"image_ratio"`
		AudioRatio           *float64 `json:"audio_ratio"`
		AudioCompletionRatio *float64 `json:"audio_completion_ratio"`
		BillingMode          string   `json:"billing_mode"`
		BillingExpr          string   `json:"billing_expr"`
	}
	if err := json.Unmarshal(envelope.Data, &items); err != nil {
		return NormalizedPricing{}, errors.New("unable to parse upstream pricing")
	}
	r := NormalizedPricing{ModelPrice: map[string]float64{}, ModelRatio: map[string]float64{}, CompletionRatio: map[string]float64{}, CacheRatio: map[string]float64{}, CreateCacheRatio: map[string]float64{}, ImageRatio: map[string]float64{}, AudioRatio: map[string]float64{}, AudioCompletionRatio: map[string]float64{}, BillingMode: map[string]string{}}
	for _, item := range items {
		if item.ModelName == "" {
			continue
		}
		if item.QuotaType == 1 {
			r.ModelPrice[item.ModelName] = item.ModelPrice
		} else {
			r.ModelRatio[item.ModelName], r.CompletionRatio[item.ModelName] = item.ModelRatio, item.CompletionRatio
		}
		if item.CacheRatio != nil {
			r.CacheRatio[item.ModelName] = *item.CacheRatio
		}
		if item.CreateCacheRatio != nil {
			r.CreateCacheRatio[item.ModelName] = *item.CreateCacheRatio
		}
		if item.ImageRatio != nil {
			r.ImageRatio[item.ModelName] = *item.ImageRatio
		}
		if item.AudioRatio != nil {
			r.AudioRatio[item.ModelName] = *item.AudioRatio
		}
		if item.AudioCompletionRatio != nil {
			r.AudioCompletionRatio[item.ModelName] = *item.AudioCompletionRatio
		}
		// Match the existing /api/pricing conversion: only an actionable tiered
		// mode (with expression) influences base-price selection.
		if item.BillingMode == billing_setting.BillingModeTieredExpr && strings.TrimSpace(item.BillingExpr) != "" {
			r.BillingMode[item.ModelName] = item.BillingMode
		}
	}
	return r, nil
}

func parseOpenRouterPricing(body []byte) (NormalizedPricing, error) {
	var raw struct {
		Data []struct {
			ID      string `json:"id"`
			Pricing struct {
				Prompt         string `json:"prompt"`
				Completion     string `json:"completion"`
				InputCacheRead string `json:"input_cache_read"`
			} `json:"pricing"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return NormalizedPricing{}, err
	}
	r := NormalizedPricing{ModelRatio: map[string]float64{}, CompletionRatio: map[string]float64{}, CacheRatio: map[string]float64{}}
	for _, item := range raw.Data {
		input, inputErr := strconv.ParseFloat(item.Pricing.Prompt, 64)
		output, outputErr := strconv.ParseFloat(item.Pricing.Completion, 64)
		if inputErr != nil && outputErr != nil {
			continue
		}
		if inputErr != nil {
			input = 0
		}
		if outputErr != nil {
			output = 0
		}
		if input < 0 || output < 0 {
			continue
		}
		if input == 0 && output == 0 {
			r.ModelRatio[item.ID] = 0
			continue
		}
		if input > 0 {
			r.ModelRatio[item.ID] = input * 1000 * ratio_setting.USD
			r.CompletionRatio[item.ID] = output / input
			if item.Pricing.InputCacheRead != "" {
				if cache, cacheErr := strconv.ParseFloat(item.Pricing.InputCacheRead, 64); cacheErr == nil && cache >= 0 {
					r.CacheRatio[item.ID] = cache / input
				}
			}
		}
	}
	return r, nil
}

func parseModelsDevPricing(body []byte) (NormalizedPricing, error) {
	var providers map[string]struct {
		Models map[string]struct {
			Cost struct {
				Input     *float64 `json:"input"`
				Output    *float64 `json:"output"`
				CacheRead *float64 `json:"cache_read"`
			} `json:"cost"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &providers); err != nil || len(providers) == 0 {
		return NormalizedPricing{}, errors.New("invalid models.dev response")
	}
	type candidate struct {
		provider      string
		input         float64
		output, cache *float64
	}
	chosen := map[string]candidate{}
	providerNames := make([]string, 0, len(providers))
	for name := range providers {
		providerNames = append(providerNames, name)
	}
	sort.Strings(providerNames)
	for _, providerName := range providerNames {
		modelNames := make([]string, 0, len(providers[providerName].Models))
		for name := range providers[providerName].Models {
			modelNames = append(modelNames, name)
		}
		sort.Strings(modelNames)
		for _, name := range modelNames {
			m := providers[providerName].Models[name]
			if m.Cost.Input == nil || !isFiniteNonNegative(*m.Cost.Input) {
				continue
			}
			next := candidate{provider: providerName, input: *m.Cost.Input}
			if m.Cost.Output != nil && !isFiniteNonNegative(*m.Cost.Output) {
				continue
			}
			if m.Cost.Input != nil && *m.Cost.Input == 0 && m.Cost.Output != nil && *m.Cost.Output > 0 {
				continue
			}
			if m.Cost.Output != nil {
				value := *m.Cost.Output
				next.output = &value
			}
			if m.Cost.CacheRead != nil && isFiniteNonNegative(*m.Cost.CacheRead) {
				value := *m.Cost.CacheRead
				next.cache = &value
			}
			current, exists := chosen[name]
			if !exists || preferModelsDevCandidate(current.input, current.provider, next.input, next.provider) {
				chosen[name] = next
			}
		}
	}
	r := NormalizedPricing{ModelRatio: map[string]float64{}, CompletionRatio: map[string]float64{}, CacheRatio: map[string]float64{}}
	for name, c := range chosen {
		r.ModelRatio[name] = c.input * float64(ratio_setting.USD) / 1000
		if c.input > 0 && c.output != nil {
			r.CompletionRatio[name] = *c.output / c.input
		}
		if c.input > 0 && c.cache != nil {
			r.CacheRatio[name] = *c.cache / c.input
		}
	}
	return r, nil
}

func isFiniteNonNegative(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0) && value >= 0
}
func preferModelsDevCandidate(current float64, currentProvider string, next float64, nextProvider string) bool {
	if (current == 0) != (next == 0) {
		return next > 0
	}
	if current != next {
		return next < current
	}
	return nextProvider < currentProvider
}

// BuildMissingPricingPatch reads only canonical DB rows, never OptionMap.
func BuildMissingPricingPatch(models []string, source NormalizedPricing) ([]PricingPatchOperation, error) {
	current := make(map[string]map[string]json.RawMessage, 8)
	keys := []string{"ModelPrice", "ModelRatio", "CompletionRatio", "CacheRatio", "CreateCacheRatio", "ImageRatio", "AudioRatio", "AudioCompletionRatio"}
	for _, key := range keys {
		var row model.Option
		if err := model.DB.Where(&model.Option{Key: key}).First(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil, fmt.Errorf("%w: %s", model.ErrPricingOptionIntegrity, key)
			}
			return nil, err
		}
		var values map[string]json.RawMessage
		if err := json.Unmarshal([]byte(row.Value), &values); err != nil || values == nil {
			return nil, fmt.Errorf("invalid pricing option %s", key)
		}
		current[key] = values
	}
	names := map[string]struct{}{}
	for _, name := range models {
		if name = strings.TrimSpace(ratio_setting.FormatMatchingModelName(name)); name != "" {
			names[name] = struct{}{}
		}
	}
	ordered := make([]string, 0, len(names))
	for name := range names {
		ordered = append(ordered, name)
	}
	sort.Strings(ordered)
	result := make([]PricingPatchOperation, 0)
	add := func(key, name string, values map[string]float64) {
		if _, exists := current[key][name]; exists {
			return
		}
		value, ok := values[name]
		if !ok {
			return
		}
		raw, _ := json.Marshal(value)
		result = append(result, PricingPatchOperation{Key: key, Model: name, Action: PricingPatchSetIfMissing, Value: raw})
	}
	for _, name := range ordered {
		_, hasPrice := current["ModelPrice"][name]
		_, hasRatio := current["ModelRatio"][name]
		if !hasPrice && !hasRatio && source.BillingMode[name] != billing_setting.BillingModeTieredExpr {
			if source.BillingMode[name] == billing_setting.BillingModeRatio {
				add("ModelRatio", name, source.ModelRatio)
			} else if _, ok := source.ModelPrice[name]; ok {
				add("ModelPrice", name, source.ModelPrice)
			} else {
				add("ModelRatio", name, source.ModelRatio)
			}
		}
		add("CompletionRatio", name, source.CompletionRatio)
		add("CacheRatio", name, source.CacheRatio)
		add("CreateCacheRatio", name, source.CreateCacheRatio)
		add("ImageRatio", name, source.ImageRatio)
		add("AudioRatio", name, source.AudioRatio)
		add("AudioCompletionRatio", name, source.AudioCompletionRatio)
	}
	return result, nil
}

// Kept for callers that need to adapt the previous map-shaped ratio-sync DTO.
func (n NormalizedPricing) ToSyncData() map[string]any {
	return map[string]any{"model_price": n.ModelPrice, "model_ratio": n.ModelRatio, "completion_ratio": n.CompletionRatio, "cache_ratio": n.CacheRatio, "create_cache_ratio": n.CreateCacheRatio, "image_ratio": n.ImageRatio, "audio_ratio": n.AudioRatio, "audio_completion_ratio": n.AudioCompletionRatio, billing_setting.BillingModeField: n.BillingMode}
}
