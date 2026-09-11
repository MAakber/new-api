package plugins_test

import (
	"context"
	"testing"

	"github.com/QuantumNous/new-api/pkg/jsplugin"
	builtinplugins "github.com/QuantumNous/new-api/plugins"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestViduResponsesProtocol(t *testing.T) {
	testVideoResponsesProtocol(t, videoResponsesTestCase{
		pluginKey: "vidu",
		model:     "viduq2",
		requestBody: map[string]any{
			"model": "viduq2",
			"input": []any{map[string]any{"role": "user", "content": []any{
				map[string]any{"type": "input_text", "text": "move between frames"},
				map[string]any{"type": "input_image", "image_url": "https://cdn.example/first.png"},
				map[string]any{"type": "input_image", "image_url": "https://cdn.example/last.png"},
			}}},
			"seconds": 8,
			"size":    "720p",
		},
		wantAction: "first_tail_to_video",
		wantRequest: map[string]any{
			"model":    "viduq2",
			"prompt":   "move between frames",
			"images":   []any{"https://cdn.example/first.png", "https://cdn.example/last.png"},
			"duration": float64(8),
			"size":     "720p",
		},
		wantUsageKeys:       []string{"credits", "duration", "resolution"},
		wantSubmitUsageKeys: []string{"duration", "resolution"},
		wantVendorName:      "vidu",
	})
}

func TestViduSubmitPreservesExplicitFalseAndZero(t *testing.T) {
	source, err := builtinplugins.Source("vidu")
	require.NoError(t, err)
	plugin, err := jsplugin.NewRegistry().RegisterFactory(source, jsplugin.Options{Key: "vidu"})
	require.NoError(t, err)
	value, err := plugin.Engine.Call(context.Background(), "buildSubmitRequest", map[string]any{
		"baseUrl": "https://provider.example", "upstreamModel": "viduq2", "apiKey": "fixture-key",
		"requestBody": map[string]any{
			"model": "viduq2", "prompt": "a quiet landscape", "duration": 8, "size": "720p",
			"metadata": map[string]any{"bgm": false, "seed": 0},
		},
	})
	require.NoError(t, err)
	request, ok := value.(map[string]any)
	require.True(t, ok)
	body, ok := request["body"].(map[string]any)
	require.True(t, ok)
	assert.Contains(t, body, "bgm")
	assert.Equal(t, false, body["bgm"])
	assert.Contains(t, body, "seed")
	assert.EqualValues(t, 0, body["seed"])
}
