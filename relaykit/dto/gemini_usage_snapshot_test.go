package dto

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGeminiCumulativeModalityUsageDoesNotAccumulateAcrossFrames(t *testing.T) {
	t.Parallel()
	first := &GeminiUsageMetadata{
		PromptTokenCount: 100,
		PromptTokensDetails: []GeminiPromptTokensDetails{
			{Modality: "AUDIO", TokenCount: 40},
			{Modality: "TEXT", TokenCount: 60},
		},
	}
	final := &GeminiUsageMetadata{
		PromptTokenCount:     100,
		CandidatesTokenCount: 15,
		TotalTokenCount:      115,
		PromptTokensDetails: []GeminiPromptTokensDetails{
			{Modality: " audio ", TokenCount: 40},
			{Modality: "TEXT", TokenCount: 60},
		},
	}
	merged := MergeGeminiUsageMetadataNonZero(first, final)
	usage, ok := NewGeminiChatBillingUsage(merged).CanonicalUsage()
	require.True(t, ok)
	assert.Equal(t, 100, usage.PromptTokens)
	assert.Equal(t, 40, usage.PromptTokensDetails.AudioTokens)
	assert.Equal(t, 60, usage.PromptTokensDetails.TextTokens)
	assert.Equal(t, 15, usage.CompletionTokens)

	repeated := MergeGeminiUsageMetadataNonZero(merged, final)
	repeatedUsage, ok := NewGeminiChatBillingUsage(repeated).CanonicalUsage()
	require.True(t, ok)
	assert.Equal(t, 40, repeatedUsage.PromptTokensDetails.AudioTokens)
	assert.Equal(t, 60, repeatedUsage.PromptTokensDetails.TextTokens)
	assert.Equal(t, 40, first.PromptTokensDetails[0].TokenCount)
}
