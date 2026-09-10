package oauth

import (
	"errors"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/setting"
)

// The application supplies its shared proxy transport without making provider
// implementations depend on the service package that consumes their registry.
var loginHTTPClientFactory func(time.Duration) (*http.Client, error)

// RegisterLoginHTTPClientFactory is called during application initialization,
// before any authentication requests are served.
func RegisterLoginHTTPClientFactory(factory func(time.Duration) (*http.Client, error)) {
	loginHTTPClientFactory = factory
}

func GetLoginHTTPClient(timeout time.Duration) (*http.Client, error) {
	if loginHTTPClientFactory != nil {
		return loginHTTPClientFactory(timeout)
	}
	if setting.GetLoginProxyURL() != "" {
		return nil, errors.New("login proxy transport is not initialized")
	}
	return &http.Client{Timeout: timeout}, nil
}

// Long-lived OAuth clients, including cached JWKS verifiers, resolve the current
// login proxy on each request so administrator proxy changes take effect.
type loginProxyTransport struct{}

func (loginProxyTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	client, err := GetLoginHTTPClient(20 * time.Second)
	if err != nil {
		return nil, err
	}
	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	return transport.RoundTrip(request)
}
