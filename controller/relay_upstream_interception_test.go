package controller

import (
	"testing"

	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/require"
)

func TestIsUpstreamInterceptionRelayMode(t *testing.T) {
	require.True(t, isUpstreamInterceptionRelayMode(relayconstant.RelayModeUnknown, types.RelayFormatClaude))
	require.True(t, isUpstreamInterceptionRelayMode(relayconstant.RelayModeChatCompletions, types.RelayFormatOpenAI))
	require.True(t, isUpstreamInterceptionRelayMode(relayconstant.RelayModeResponses, types.RelayFormatOpenAIResponses))
	require.False(t, isUpstreamInterceptionRelayMode(relayconstant.RelayModeUnknown, types.RelayFormatOpenAI))
	require.False(t, isUpstreamInterceptionRelayMode(relayconstant.RelayModeAudioSpeech, types.RelayFormatOpenAI))
}
