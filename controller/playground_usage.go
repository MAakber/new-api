package controller

import (
	"encoding/json"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

type playgroundUsage struct {
	InputTokens          *int64 `json:"input_tokens,omitempty"`
	OutputTokens         *int64 `json:"output_tokens,omitempty"`
	TotalTokens          *int64 `json:"total_tokens,omitempty"`
	CachedTokens         *int64 `json:"cached_tokens,omitempty"`
	CacheWriteTokens     *int64 `json:"cache_write_tokens,omitempty"`
	ReasoningTokens      *int64 `json:"reasoning_tokens,omitempty"`
	Estimated            bool   `json:"estimated"`
	Partial              bool   `json:"partial"`
	Rounds               int    `json:"rounds"`
	ModelDurationMS      int64  `json:"model_duration_ms"`
	GenerationDurationMS int64  `json:"generation_duration_ms"`
	FirstTokenMS         *int64 `json:"first_token_ms,omitempty"`
}

// Each round contributes once. Streaming usage snapshots replace each other
// inside the round writer; they are never added together.
func (total *playgroundUsage) addRound(round *playgroundRelayRound, elapsedBeforeRound time.Duration) {
	total.Rounds++
	total.ModelDurationMS += round.Duration.Milliseconds()
	total.GenerationDurationMS += round.GenerationDuration.Milliseconds()
	if total.FirstTokenMS == nil && round.FirstToken > 0 {
		total.FirstTokenMS = common.GetPointer((elapsedBeforeRound + round.FirstToken).Milliseconds())
	}
	if len(round.RawUsage) == 0 {
		total.Partial = true
		return
	}
	var raw map[string]json.RawMessage
	var usage dto.Usage
	if common.Unmarshal(round.RawUsage, &raw) != nil || common.Unmarshal(round.RawUsage, &usage) != nil {
		total.Partial = true
		return
	}
	canonical, hasCanonical := usage.BillingUsage.CanonicalUsage()
	if hasCanonical {
		usage = *canonical
	}
	if usage.BillingUsage != nil {
		total.Estimated = total.Estimated || usage.BillingUsage.Estimated
	}
	input := usage.PromptTokens
	if usage.InputTokens > 0 || (!hasCanonical && raw["input_tokens"] != nil) {
		input = usage.InputTokens
	}
	output := usage.CompletionTokens
	if usage.OutputTokens > 0 || (!hasCanonical && raw["output_tokens"] != nil) {
		output = usage.OutputTokens
	}
	if raw["prompt_tokens"] != nil || raw["input_tokens"] != nil || usage.BillingUsage != nil {
		addPlaygroundTokens(&total.InputTokens, input)
	} else {
		total.Partial = true
	}
	if raw["completion_tokens"] != nil || raw["output_tokens"] != nil || usage.BillingUsage != nil {
		addPlaygroundTokens(&total.OutputTokens, output)
	} else {
		total.Partial = true
	}
	if total.InputTokens != nil && total.OutputTokens != nil {
		total.TotalTokens = common.GetPointer(*total.InputTokens + *total.OutputTokens)
	}
	var details map[string]json.RawMessage
	_ = common.Unmarshal(raw["prompt_tokens_details"], &details)
	if details == nil {
		_ = common.Unmarshal(raw["input_tokens_details"], &details)
	}
	cached := max(usage.PromptTokensDetails.CachedTokens, usage.PromptCacheHitTokens)
	write := usage.PromptTokensDetails.CacheCreationTokensTotal()
	if usage.InputTokensDetails != nil {
		cached = max(cached, usage.InputTokensDetails.CachedTokens)
		write = max(write, usage.InputTokensDetails.CacheCreationTokensTotal())
	}
	if cached > 0 || details["cached_tokens"] != nil || raw["prompt_cache_hit_tokens"] != nil {
		addPlaygroundTokens(&total.CachedTokens, cached)
	}
	if write > 0 || details["cache_write_tokens"] != nil || details["cached_creation_tokens"] != nil {
		addPlaygroundTokens(&total.CacheWriteTokens, write)
	}
	var completionDetails map[string]json.RawMessage
	_ = common.Unmarshal(raw["completion_tokens_details"], &completionDetails)
	if usage.CompletionTokenDetails.ReasoningTokens > 0 || completionDetails["reasoning_tokens"] != nil {
		addPlaygroundTokens(&total.ReasoningTokens, usage.CompletionTokenDetails.ReasoningTokens)
	}
}

func addPlaygroundTokens(total **int64, value int) {
	if value < 0 {
		return
	}
	// Statistics must remain exactly representable in the browser. These display
	// values do not participate in settlement, which stays in Relay.
	const maxDisplayTokens int64 = (1 << 52) - 1
	if *total == nil {
		*total = common.GetPointer(int64(0))
	}
	**total += min(int64(value), maxDisplayTokens-**total)
}

type playgroundRelayRound struct {
	Response           dto.OpenAITextResponse
	RawUsage           json.RawMessage
	Duration           time.Duration
	GenerationDuration time.Duration
	FirstToken         time.Duration
	Sources            []playgroundWebSearchSource
}
