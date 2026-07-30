package common

import (
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRelayUserAgentBlacklistNormalizesAndUsesRE2Semantics(t *testing.T) {
	normalized, err := SetRelayUserAgentBlacklistConfig(true, "  (?i)^curl/.*$  \r\n\nfoo,bar\n(?i)^curl/.*$\n")
	require.NoError(t, err)
	require.Equal(t, "(?i)^curl/.*$\nfoo,bar", normalized)
	require.True(t, IsRelayUserAgentBlacklisted("CURL/8.0"))
	require.True(t, IsRelayUserAgentBlacklisted("prefix foo,bar suffix"))
	require.False(t, IsRelayUserAgentBlacklisted("curlish"))

	_, err = SetRelayUserAgentBlacklistConfig(true, "[")
	require.Error(t, err)
	require.Contains(t, err.Error(), "line 1")
	// An invalid update must not replace the last known-good snapshot.
	require.True(t, IsRelayUserAgentBlacklisted("curl/8.0"))

	_, err = SetRelayUserAgentBlacklistConfig(false, "curl")
	require.NoError(t, err)
	require.False(t, IsRelayUserAgentBlacklisted("curl/8.0"))
}

func TestRelayUserAgentBlacklistSnapshotConcurrentUpdates(t *testing.T) {
	require.NoError(t, setRelayUserAgentBlacklistForTest(true, "agent-a"))
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 200; j++ {
				_ = IsRelayUserAgentBlacklisted("agent-a")
				_ = IsRelayUserAgentBlacklisted("agent-b")
			}
		}()
	}
	for i := 0; i < 100; i++ {
		pattern := "agent-a"
		if i%2 == 1 {
			pattern = "agent-b"
		}
		require.NoError(t, setRelayUserAgentBlacklistForTest(true, pattern))
	}
	wg.Wait()
}

func setRelayUserAgentBlacklistForTest(enabled bool, patterns string) error {
	_, err := SetRelayUserAgentBlacklistConfig(enabled, strings.TrimSpace(patterns))
	return err
}
