package setting

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoginProxyURLNormalizesAndRejectsUnsupportedSchemes(t *testing.T) {
	previousProxyURL := GetLoginProxyURL()
	t.Cleanup(func() { _, _ = SetLoginProxyURL(previousProxyURL) })
	canonicalURL, err := SetLoginProxyURL("  HTTPS://Proxy.Example:8443/  ")
	require.NoError(t, err)
	require.Equal(t, "https://Proxy.Example:8443", canonicalURL)
	require.Equal(t, canonicalURL, GetLoginProxyURL())

	canonicalURL, err = SetLoginProxyURL("socks5h://proxy.example")
	require.NoError(t, err)
	require.Equal(t, "socks5h://proxy.example:1080", canonicalURL)

	_, err = SetLoginProxyURL("ftp://proxy.example:21")
	require.Error(t, err)
	require.Equal(t, "socks5h://proxy.example:1080", GetLoginProxyURL())

	_, err = SetLoginProxyURL("")
	require.NoError(t, err)
	require.Empty(t, GetLoginProxyURL())
}
