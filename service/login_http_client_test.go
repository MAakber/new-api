package service

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/require"
)

func TestGetLoginHTTPClientUsesConfiguredProxyAndPreservesTimeout(t *testing.T) {
	previousProxyURL := setting.GetLoginProxyURL()
	t.Cleanup(func() { _, _ = setting.SetLoginProxyURL(previousProxyURL) })
	requests := 0
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.String() == "http://example.test/start" {
			http.Redirect(w, r, "http://example.test/final", http.StatusFound)
			return
		}
		require.Equal(t, "http://example.test/final", r.URL.String())
		w.WriteHeader(http.StatusNoContent)
	}))
	defer proxy.Close()

	_, err := setting.SetLoginProxyURL(proxy.URL)
	require.NoError(t, err)

	timeout := 123 * time.Millisecond
	client, err := GetLoginHTTPClient(timeout)
	require.NoError(t, err)
	require.Equal(t, timeout, client.Timeout)
	require.Nil(t, client.CheckRedirect)

	response, err := client.Get("http://example.test/start")
	require.NoError(t, err)
	defer response.Body.Close()
	require.Equal(t, http.StatusNoContent, response.StatusCode)
	require.Equal(t, 2, requests)
}

func TestGetLoginHTTPClientWithoutConfiguredProxyPreservesDefaultBehavior(t *testing.T) {
	previousProxyURL := setting.GetLoginProxyURL()
	t.Cleanup(func() { _, _ = setting.SetLoginProxyURL(previousProxyURL) })
	_, err := setting.SetLoginProxyURL("")
	require.NoError(t, err)

	timeout := 321 * time.Millisecond
	client, err := GetLoginHTTPClient(timeout)
	require.NoError(t, err)
	require.Equal(t, timeout, client.Timeout)
	require.Nil(t, client.Transport)
	require.Nil(t, client.CheckRedirect)
}
