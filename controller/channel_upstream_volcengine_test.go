package controller

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFetchVolcEngineModelsPreservesProviderEndpointAndAuthentication(t *testing.T) {
	for _, test := range []struct {
		name        string
		codingPlan  bool
		requestPath string
	}{
		{name: "standard Ark endpoint", requestPath: "/api/v3/models"},
		{name: "explicit coding plan keeps its existing endpoint", codingPlan: true, requestPath: "/coding/v1/models"},
	} {
		t.Run(test.name, func(t *testing.T) {
			received := make(chan *http.Request, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				received <- r.Clone(r.Context())
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"data":[{"id":"doubao-seed-1-6"},{"id":"doubao-seed-1-6"},{"id":"doubao-1-5-pro"}]}`))
			}))
			t.Cleanup(server.Close)
			baseURL := server.URL
			if test.codingPlan {
				baseURL += "/test-coding-plan"
				constant.ChannelSpecialBases[baseURL] = constant.ChannelSpecialBase{OpenAIBaseURL: server.URL + "/coding"}
				t.Cleanup(func() { delete(constant.ChannelSpecialBases, baseURL) })
			}
			channel := &model.Channel{Type: constant.ChannelTypeVolcEngine, Key: "ark-test-key", BaseURL: &baseURL}

			models, err := fetchChannelUpstreamModelIDs(channel)
			require.NoError(t, err)
			assert.Equal(t, []string{"doubao-seed-1-6", "doubao-1-5-pro"}, models)
			request := <-received
			assert.Equal(t, test.requestPath, request.URL.Path)
			assert.Equal(t, "Bearer ark-test-key", request.Header.Get("Authorization"))
		})
	}
}
