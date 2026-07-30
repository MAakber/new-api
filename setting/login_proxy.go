package setting

import (
	"strings"
	"sync/atomic"

	"github.com/QuantumNous/new-api/common"
)

type loginProxyConfig struct {
	url string
}

var loginProxy atomic.Pointer[loginProxyConfig]

// NormalizeLoginProxyURL validates a proxy URL and returns its canonical form.
func NormalizeLoginProxyURL(rawURL string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", nil
	}
	parsedURL, err := common.ParseProxyURLStrict(trimmedURL)
	if err != nil {
		return "", err
	}
	return parsedURL.String(), nil
}

// SetLoginProxyURL validates and stores the canonical proxy URL used only for
// external login requests. An empty value keeps the previous direct behavior.
func SetLoginProxyURL(rawURL string) (string, error) {
	canonicalURL, err := NormalizeLoginProxyURL(rawURL)
	if err != nil {
		return "", err
	}
	loginProxy.Store(&loginProxyConfig{url: canonicalURL})
	return canonicalURL, nil
}

func GetLoginProxyURL() string {
	config := loginProxy.Load()
	if config == nil {
		return ""
	}
	return config.url
}
