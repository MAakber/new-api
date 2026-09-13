package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type mcpTestRoundTripper func(*http.Request) (*http.Response, error)

func (transport mcpTestRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestMCPSessionCleanupUsesAnIndependentDeadline(t *testing.T) {
	var cleanupContext context.Context
	transport := &mcpHTTPTransport{
		origin: "https://mcp.example.com",
		base: mcpTestRoundTripper(func(request *http.Request) (*http.Response, error) {
			cleanupContext = request.Context()
			return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(""))}, nil
		}),
	}
	request, err := http.NewRequestWithContext(t.Context(), http.MethodDelete, "https://mcp.example.com/mcp", nil)
	require.NoError(t, err)
	response, err := transport.RoundTrip(request)
	require.NoError(t, err)
	_, bounded := cleanupContext.Deadline()
	assert.True(t, bounded, "session cleanup must not inherit an unbounded SDK context")
	require.NoError(t, response.Body.Close())
	assert.ErrorIs(t, cleanupContext.Err(), context.Canceled)
}

func mcpTestDatabase(t *testing.T) {
	t.Helper()
	previousDB, previousPool := model.DB, sharedMCPPool
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB = db
	sharedMCPPool = &mcpPool{runtimes: make(map[int]*mcpRuntime), semaphore: make(chan struct{}, 32)}
	require.NoError(t, db.AutoMigrate(&model.MCPServer{}))
	t.Cleanup(func() {
		for id := range sharedMCPPool.runtimes {
			InvalidateMCPServer(id)
		}
		model.DB = previousDB
		sharedMCPPool = previousPool
		require.NoError(t, sqlDB.Close())
	})
}

func configuredMCPTestServer(t *testing.T, endpoint string) *model.MCPServer {
	t.Helper()
	config := MCPServerConfig{Name: "fixture", URL: endpoint, Enabled: true, Groups: []string{"allowed"}, TimeoutSeconds: 5, MaxConcurrency: 2}
	server, err := PrepareMCPServer(config, nil)
	require.NoError(t, err)
	tools, err := TestMCPConnection(t.Context(), *server)
	require.NoError(t, err)
	require.Len(t, tools, 1)
	config.Tools = []MCPToolConfig{{Name: tools[0].Name, Enabled: true, ReadOnly: true, Kind: "search", SchemaHash: tools[0].SchemaHash}}
	server, err = PrepareMCPServer(config, nil)
	require.NoError(t, err)
	require.NoError(t, model.SaveMCPServer(server))
	return server
}

func TestMCPProtocolPermissionsAndRevocation(t *testing.T) {
	for _, jsonResponse := range []bool{true, false} {
		t.Run(map[bool]string{true: "JSON", false: "SSE"}[jsonResponse], func(t *testing.T) {
			mcpTestDatabase(t)
			var calls atomic.Int32
			server := mcp.NewServer(&mcp.Implementation{Name: "fixture", Version: "1"}, nil)
			server.AddTool(&mcp.Tool{Name: "lookup", InputSchema: map[string]any{"type": "object", "properties": map[string]any{"query": map[string]any{"type": "string"}}, "required": []string{"query"}}}, func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
				calls.Add(1)
				return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: `{"result":"ok","nested":{"api_key":"must-not-be-shown"}}`}}}, nil
			})
			httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{JSONResponse: jsonResponse}))
			t.Cleanup(httpServer.Close)
			saved := configuredMCPTestServer(t, httpServer.URL)
			denied, err := ListAvailableMCPTools("denied")
			require.NoError(t, err)
			assert.Empty(t, denied)
			_, err = OpenMCPRun(t.Context(), "denied", []string{MCPToolID(saved.ID, "lookup")}, false)
			require.Error(t, err)
			run, err := OpenMCPRun(t.Context(), "allowed", nil, true)
			require.NoError(t, err)
			defer run.Close()
			require.Len(t, run.Tools, 1)
			_, _, err = run.Tools[0].Call(t.Context(), map[string]any{"query": 123})
			require.ErrorContains(t, err, "schema")
			assert.Zero(t, calls.Load())
			text, failed, err := run.Tools[0].Call(t.Context(), map[string]any{"query": "weather"})
			require.NoError(t, err)
			assert.False(t, failed)
			assert.Contains(t, text, "ok")
			assert.NotContains(t, text, "must-not-be-shown")
			saved.Enabled = false
			require.NoError(t, model.SaveMCPServer(saved))
			_, _, err = run.Tools[0].Call(t.Context(), map[string]any{"query": "forecast"})
			require.ErrorContains(t, err, "configuration changed")
			assert.EqualValues(t, 1, calls.Load())
		})
	}
}

func TestMCPCredentialsStayEncryptedAndOffPublicViews(t *testing.T) {
	t.Setenv("CRYPTO_SECRET", "fixture-persistent-secret")
	previous := common.CryptoSecret
	common.CryptoSecret = "fixture-persistent-secret"
	t.Cleanup(func() { common.CryptoSecret = previous })
	input := MCPServerConfig{Name: "secret fixture", URL: "https://mcp.example.com/mcp", Groups: []string{"allowed"}, TimeoutSeconds: 30, MaxConcurrency: 2, Credentials: &MCPCredentials{Headers: map[string]string{"Authorization": "Bearer fixture-private-token"}, Query: map[string]string{"api_key": "fixture-query-secret"}}}
	saved, err := PrepareMCPServer(input, nil)
	require.NoError(t, err)
	assert.NotContains(t, saved.EncryptedCredentials, "fixture-private-token")
	view, err := MCPServerView(*saved)
	require.NoError(t, err)
	encoded, err := common.Marshal(view)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "fixture-private-token")
	assert.Nil(t, view.Credentials)
	assert.True(t, view.CredentialSet)
	runtime, err := newMCPRuntime(*saved)
	require.NoError(t, err)
	defer runtime.transport.CloseIdleConnections()
	assert.NotContains(t, runtime.redactor.Replace("Bearer fixture-private-token fixture-query-secret"), "fixture-")
	input.Credentials = nil
	retained, err := PrepareMCPServer(input, saved)
	require.NoError(t, err)
	assert.Equal(t, saved.EncryptedCredentials, retained.EncryptedCredentials)
	input.URL = "https://other.example.com/mcp"
	_, err = PrepareMCPServer(input, saved)
	require.Error(t, err)
	input.Credentials = &MCPCredentials{}
	cleared, err := PrepareMCPServer(input, saved)
	require.NoError(t, err)
	assert.Empty(t, cleared.EncryptedCredentials)
	for _, endpoint := range []string{"http://mcp.example.com/mcp", "https://mcp.example.com/mcp?key=secret", "https://user:pass@mcp.example.com/mcp"} {
		input.URL = endpoint
		input.Credentials = &MCPCredentials{Headers: map[string]string{"Authorization": "Bearer token"}}
		_, err = PrepareMCPServer(input, nil)
		require.Error(t, err)
	}
	t.Setenv("CRYPTO_SECRET", "")
	t.Setenv("SESSION_SECRET", "")
	input.URL = "https://mcp.example.com/mcp"
	_, err = PrepareMCPServer(input, nil)
	require.ErrorContains(t, err, "persistent")
}

func TestMCPTransportNeverForwardsCredentialsAcrossOrigins(t *testing.T) {
	targetCalls := atomic.Int32{}
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { targetCalls.Add(1) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer private", r.Header.Get("Authorization"))
		http.Redirect(w, r, target.URL, http.StatusFound)
	}))
	defer source.Close()
	transport := &mcpHTTPTransport{base: http.DefaultTransport, origin: source.URL, credentials: MCPCredentials{Headers: map[string]string{"Authorization": "Bearer private"}}}
	client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Get(source.URL)
	require.NoError(t, err)
	require.NoError(t, response.Body.Close())
	assert.Equal(t, http.StatusFound, response.StatusCode)
	request, err := http.NewRequest(http.MethodGet, target.URL, nil)
	require.NoError(t, err)
	_, err = transport.RoundTrip(request)
	require.Error(t, err)
	assert.Zero(t, targetCalls.Load())
	body := &mcpBoundedBody{ReadCloser: io.NopCloser(strings.NewReader("oversized")), remaining: 4}
	_, err = io.ReadAll(body)
	require.Error(t, err)
}

func TestMCPCancellationAndChangedSchemas(t *testing.T) {
	mcpTestDatabase(t)
	started := make(chan struct{})
	server := mcp.NewServer(&mcp.Implementation{Name: "fixture", Version: "1"}, nil)
	tool := &mcp.Tool{Name: "lookup", InputSchema: map[string]any{"type": "object"}}
	server.AddTool(tool, func(ctx context.Context, _ *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		close(started)
		<-ctx.Done()
		return nil, ctx.Err()
	})
	httpServer := httptest.NewServer(mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, nil))
	defer httpServer.Close()
	saved := configuredMCPTestServer(t, httpServer.URL)
	run, err := OpenMCPRun(t.Context(), "allowed", nil, true)
	require.NoError(t, err)
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	done := make(chan error, 1)
	go func() { _, _, callErr := run.Tools[0].Call(ctx, map[string]any{}); done <- callErr }()
	<-started
	cancel()
	require.ErrorIs(t, <-done, context.Canceled)
	run.Close()
	server.AddTool(&mcp.Tool{Name: "lookup", InputSchema: map[string]any{"type": "object", "required": []string{"newField"}}}, func(context.Context, *mcp.CallToolRequest) (*mcp.CallToolResult, error) { return nil, nil })
	_, err = OpenMCPRun(t.Context(), "allowed", []string{MCPToolID(saved.ID, "lookup")}, false)
	require.ErrorContains(t, err, "schema changed")
}
