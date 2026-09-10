package service

import (
	"math"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRelayHeaderTimeoutConfigurationOverridesClonedTransport(t *testing.T) {
	originalTransport := http.DefaultTransport
	originalHeaders, originalRequest := common.RelayResponseHeaderTimeout, common.RelayTimeout
	t.Cleanup(func() {
		http.DefaultTransport = originalTransport
		common.RelayResponseHeaderTimeout, common.RelayTimeout = originalHeaders, originalRequest
	})
	common.RelayTimeout = 0
	http.DefaultTransport = &http.Transport{ResponseHeaderTimeout: 37 * time.Second}
	for _, tt := range []struct {
		name    string
		seconds int
		want    time.Duration
	}{
		{"zero disables inherited timeout", 0, 0},
		{"negative disables inherited timeout", -1, 0},
		{"positive limits only headers", 2, 2 * time.Second},
		{"large setting cannot overflow", math.MaxInt, time.Duration(math.MaxInt64/int64(time.Second)) * time.Second},
	} {
		t.Run(tt.name, func(t *testing.T) {
			common.RelayResponseHeaderTimeout = tt.seconds
			transport := newRelayHTTPTransport()
			t.Cleanup(transport.CloseIdleConnections)
			client := newRelayHTTPClient(transport)
			assert.Equal(t, tt.want, transport.ResponseHeaderTimeout)
			assert.Zero(t, client.Timeout, "header limits must not impose a response-body deadline")
		})
	}
}

func TestRelayHeaderTimeoutReleasesSilentUpstreamRequest(t *testing.T) {
	original := common.RelayResponseHeaderTimeout
	t.Cleanup(func() { common.RelayResponseHeaderTimeout = original })
	common.RelayResponseHeaderTimeout = 1
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	t.Cleanup(server.Close)
	transport := newRelayHTTPTransport()
	transport.Proxy = nil
	t.Cleanup(transport.CloseIdleConnections)
	client := &http.Client{Transport: transport}
	response, err := client.Get(server.URL)
	if response != nil {
		t.Cleanup(func() { _ = response.Body.Close() })
	}
	require.Error(t, err)
	var timeout net.Error
	require.ErrorAs(t, err, &timeout)
	assert.True(t, timeout.Timeout())
	assert.ErrorContains(t, err, "timeout awaiting response headers")
}
