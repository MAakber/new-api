package service

import "github.com/QuantumNous/new-api/oauth"

func init() {
	oauth.RegisterLoginHTTPClientFactory(GetLoginHTTPClient)
}
