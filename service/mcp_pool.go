package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

var ErrMCPUnavailable = errors.New("MCP service is unavailable; check its connection and tool configuration")

type mcpHTTPTransport struct {
	base        http.RoundTripper
	origin      string
	credentials MCPCredentials
}

func (transport *mcpHTTPTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	if request.URL.Scheme+"://"+request.URL.Host != transport.origin {
		return nil, errors.New("MCP authentication cannot be forwarded to another origin")
	}
	ctx := request.Context()
	var cancel context.CancelFunc
	if request.Method == http.MethodDelete {
		// The SDK detaches session cleanup from the run context. A stalled
		// DELETE must not hold a finished or cancelled chat until the tool timeout.
		ctx, cancel = context.WithTimeout(ctx, 2*time.Second)
	}
	cloned := request.Clone(ctx)
	cloned.URL = new(url.URL)
	*cloned.URL = *request.URL
	for name, value := range transport.credentials.Headers {
		cloned.Header.Set(name, value)
	}
	query := cloned.URL.Query()
	for name, value := range transport.credentials.Query {
		query.Set(name, value)
	}
	cloned.URL.RawQuery = query.Encode()
	response, err := transport.base.RoundTrip(cloned)
	if err != nil {
		if cancel != nil {
			cancel()
		}
		return nil, ErrMCPUnavailable
	}
	// Bound decoded HTTP bodies, including SSE and decompressed responses.
	response.Body = &mcpBoundedBody{ReadCloser: response.Body, remaining: 2 * 1024 * 1024, cancel: cancel}
	return response, nil
}

type mcpBoundedBody struct {
	io.ReadCloser
	remaining int64
	cancel    context.CancelFunc
}

func (body *mcpBoundedBody) Close() error {
	if body.cancel != nil {
		defer body.cancel()
	}
	return body.ReadCloser.Close()
}

func (body *mcpBoundedBody) Read(buffer []byte) (int, error) {
	if body.remaining <= 0 {
		return 0, errors.New("MCP response exceeded the size limit")
	}
	if int64(len(buffer)) > body.remaining {
		buffer = buffer[:body.remaining]
	}
	n, err := body.ReadCloser.Read(buffer)
	body.remaining -= int64(n)
	return n, err
}

type mcpRuntime struct {
	revision  int64
	client    *http.Client
	transport *http.Transport
	semaphore chan struct{}
	redactor  *strings.Replacer
}

type mcpPool struct {
	mu        sync.Mutex
	runtimes  map[int]*mcpRuntime
	semaphore chan struct{}
}

var sharedMCPPool = &mcpPool{runtimes: make(map[int]*mcpRuntime), semaphore: make(chan struct{}, 32)}

func InvalidateMCPServer(id int) {
	sharedMCPPool.mu.Lock()
	defer sharedMCPPool.mu.Unlock()
	if runtime := sharedMCPPool.runtimes[id]; runtime != nil {
		runtime.transport.CloseIdleConnections()
		delete(sharedMCPPool.runtimes, id)
	}
}

func newMCPRuntime(server model.MCPServer) (*mcpRuntime, error) {
	if server.MaxConcurrency < 1 || server.MaxConcurrency > 8 || server.TimeoutSeconds < 1 || server.TimeoutSeconds > 120 {
		return nil, ErrMCPConfiguration
	}
	credentials := MCPCredentials{}
	if server.EncryptedCredentials != "" {
		decrypted, err := common.DecryptWithCryptoSecret(server.EncryptedCredentials)
		if err != nil || common.UnmarshalJsonStr(decrypted, &credentials) != nil {
			return nil, errors.New("MCP credentials cannot be decrypted; check CRYPTO_SECRET")
		}
	}
	endpoint, err := url.Parse(server.URL)
	if err != nil {
		return nil, ErrMCPConfiguration
	}
	transport := &http.Transport{Proxy: http.ProxyFromEnvironment}
	if base, ok := http.DefaultTransport.(*http.Transport); ok {
		transport = base.Clone()
	}
	transport.MaxIdleConns = 16
	transport.MaxIdleConnsPerHost = 8
	transport.IdleConnTimeout = 90 * time.Second
	transport.ResponseHeaderTimeout = time.Duration(server.TimeoutSeconds) * time.Second
	transport.TLSHandshakeTimeout = 10 * time.Second
	secrets := make([]string, 0)
	for _, values := range []map[string]string{credentials.Headers, credentials.Query} {
		for _, value := range values {
			if value == "" {
				continue
			}
			secrets = append(secrets, value, "[redacted]", url.QueryEscape(value), "[redacted]")
			if token, ok := strings.CutPrefix(value, "Bearer "); ok && token != "" {
				secrets = append(secrets, token, "[redacted]")
			}
		}
	}
	return &mcpRuntime{
		revision: server.Revision, transport: transport, semaphore: make(chan struct{}, server.MaxConcurrency),
		redactor: strings.NewReplacer(secrets...),
		client: &http.Client{
			Transport: &mcpHTTPTransport{base: transport, origin: endpoint.Scheme + "://" + endpoint.Host, credentials: credentials},
			Timeout:   time.Duration(server.TimeoutSeconds) * time.Second,
			// An operator must configure the final endpoint; never redirect credentials.
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		},
	}, nil
}

func (pool *mcpPool) runtime(server model.MCPServer) (*mcpRuntime, error) {
	pool.mu.Lock()
	defer pool.mu.Unlock()
	if existing := pool.runtimes[server.ID]; existing != nil {
		if existing.revision == server.Revision {
			return existing, nil
		}
		existing.transport.CloseIdleConnections()
	}
	runtime, err := newMCPRuntime(server)
	if err != nil {
		return nil, err
	}
	pool.runtimes[server.ID] = runtime
	return runtime, nil
}

func discoverMCPTools(ctx context.Context, server model.MCPServer, runtime *mcpRuntime) (*mcp.ClientSession, []MCPToolInfo, error) {
	client := mcp.NewClient(&mcp.Implementation{Name: "new-api", Version: common.Version}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: server.URL, HTTPClient: runtime.client, MaxRetries: -1, DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		return nil, nil, ErrMCPUnavailable
	}
	tools := make([]MCPToolInfo, 0)
	params := &mcp.ListToolsParams{}
	seenCursors := make(map[string]bool)
	seenNames := make(map[string]bool)
	for {
		result, err := session.ListTools(ctx, params)
		if err != nil {
			session.Close()
			return nil, nil, ErrMCPUnavailable
		}
		for _, tool := range result.Tools {
			if tool == nil || tool.Name == "" || len(tool.Name) > 128 || seenNames[tool.Name] {
				session.Close()
				return nil, nil, errors.New("MCP service returned an invalid or duplicate tool name")
			}
			seenNames[tool.Name] = true
			if len(tools) >= MaxMCPTools {
				session.Close()
				return nil, nil, errors.New("MCP service returned more than 64 tools")
			}
			schema, err := common.Marshal(tool.InputSchema)
			if err != nil || len(schema) > MaxMCPToolArguments {
				session.Close()
				return nil, nil, errors.New("MCP tool schema is invalid or too large")
			}
			digest := sha256.Sum256(schema)
			tools = append(tools, MCPToolInfo{
				ID: MCPToolID(server.ID, tool.Name), ServerID: server.ID, ServerName: server.Name,
				Name: tool.Name, Description: truncateMCPText(runtime.redactor.Replace(tool.Description), 4096),
				InputSchema: schema, SchemaHash: hex.EncodeToString(digest[:]),
				ReadOnly: tool.Annotations != nil && tool.Annotations.ReadOnlyHint, Kind: "tool",
			})
		}
		if result.NextCursor == "" {
			return session, tools, nil
		}
		if seenCursors[result.NextCursor] {
			session.Close()
			return nil, nil, errors.New("MCP tool discovery returned a repeated cursor")
		}
		seenCursors[result.NextCursor] = true
		params.Cursor = result.NextCursor
	}
}

func TestMCPConnection(ctx context.Context, server model.MCPServer) ([]MCPToolInfo, error) {
	runtime, err := newMCPRuntime(server)
	if err != nil {
		return nil, err
	}
	defer runtime.transport.CloseIdleConnections()
	ctx, cancel := context.WithTimeout(ctx, time.Duration(server.TimeoutSeconds)*time.Second)
	defer cancel()
	session, tools, err := discoverMCPTools(ctx, server, runtime)
	if err == nil {
		session.Close()
	}
	return tools, err
}

type MCPRunTool struct {
	Info         MCPToolInfo
	FunctionName string
	server       model.MCPServer
	session      *mcp.ClientSession
	runtime      *mcpRuntime
	schema       *jsonschema.Resolved
}

type MCPRun struct {
	Tools    []*MCPRunTool
	sessions []*mcp.ClientSession
}

func (run *MCPRun) Close() {
	var closing sync.WaitGroup
	for _, session := range run.sessions {
		closing.Go(func() { _ = session.Close() })
	}
	closing.Wait()
}

func OpenMCPRun(ctx context.Context, group string, selected []string, search bool) (*MCPRun, error) {
	if len(selected) > MaxMCPTools {
		return nil, errors.New("too many selected MCP tools")
	}
	servers, err := model.ListMCPServers()
	if err != nil {
		return nil, err
	}
	if len(servers) > MaxMCPServers {
		return nil, errors.New("too many configured MCP services")
	}
	run := &MCPRun{Tools: make([]*MCPRunTool, 0)}
	requested := make(map[string]bool)
	for _, id := range selected {
		requested[id] = false
	}
	hasSearch := false
	for _, server := range servers {
		config, err := MCPServerView(server)
		if err != nil {
			run.Close()
			return nil, err
		}
		if !config.Enabled || !slices.Contains(config.Groups, group) {
			continue
		}
		allowed := make(map[string]MCPToolConfig)
		for _, tool := range config.Tools {
			_, explicit := requested[MCPToolID(server.ID, tool.Name)]
			if tool.Enabled && tool.ReadOnly && (explicit || (search && tool.Kind != "tool")) {
				allowed[tool.Name] = tool
			}
		}
		if len(allowed) == 0 {
			continue
		}
		runtime, err := sharedMCPPool.runtime(server)
		if err != nil {
			run.Close()
			return nil, err
		}
		session, discovered, err := discoverMCPTools(ctx, server, runtime)
		if err != nil {
			run.Close()
			return nil, err
		}
		run.sessions = append(run.sessions, session)
		for _, tool := range discovered {
			config, enabled := allowed[tool.Name]
			if !enabled {
				continue
			}
			if tool.SchemaHash != config.SchemaHash {
				run.Close()
				return nil, errors.New("MCP tool schema changed; an administrator must rediscover and approve it")
			}
			tool.Kind, tool.ReadOnly = config.Kind, true
			digest := sha256.Sum256([]byte(tool.ID))
			var schema jsonschema.Schema
			if err := common.Unmarshal(tool.InputSchema, &schema); err != nil {
				run.Close()
				return nil, errors.New("MCP tool input schema is invalid")
			}
			resolved, err := schema.Resolve(nil) // Remote schema references must never trigger network requests.
			if err != nil {
				run.Close()
				return nil, errors.New("MCP tool input schema cannot be validated locally")
			}
			run.Tools = append(run.Tools, &MCPRunTool{Info: tool, FunctionName: fmt.Sprintf("mcp_%x", digest[:16]), server: server, session: session, runtime: runtime, schema: resolved})
			requested[tool.ID] = true
			hasSearch = hasSearch || tool.Kind == "search"
		}
	}
	for _, available := range requested {
		if !available {
			run.Close()
			return nil, errors.New("selected MCP tool is unavailable or not allowed for this user group")
		}
	}
	if search && !hasSearch {
		run.Close()
		return nil, errors.New("no MCP search tool is configured for your user group")
	}
	if len(run.Tools) > MaxMCPTools {
		run.Close()
		return nil, errors.New("too many enabled MCP tools")
	}
	return run, nil
}

func (tool *MCPRunTool) Call(ctx context.Context, arguments map[string]any) (string, bool, error) {
	if err := tool.ValidateArguments(arguments); err != nil {
		return "", false, err
	}
	ctx, cancel := context.WithTimeout(ctx, time.Duration(tool.server.TimeoutSeconds)*time.Second)
	defer cancel()
	select {
	case tool.runtime.semaphore <- struct{}{}:
	case <-ctx.Done():
		return "", false, ctx.Err()
	}
	defer func() { <-tool.runtime.semaphore }()
	select {
	case sharedMCPPool.semaphore <- struct{}{}:
	case <-ctx.Done():
		return "", false, ctx.Err()
	}
	defer func() { <-sharedMCPPool.semaphore }()
	if err := model.CheckMCPServerRevision(tool.server.ID, tool.server.Revision); err != nil {
		return "", false, errors.New("MCP service configuration changed; start a new request")
	}
	result, err := tool.session.CallTool(ctx, &mcp.CallToolParams{Name: tool.Info.Name, Arguments: arguments})
	if err != nil {
		if ctx.Err() != nil {
			return "", false, ctx.Err()
		}
		return "", false, ErrMCPUnavailable
	}
	if result == nil {
		return "", false, errors.New("MCP tool returned no result")
	}
	var content strings.Builder
	if result.StructuredContent != nil {
		encoded, err := common.Marshal(result.StructuredContent)
		if err != nil {
			return "", false, errors.New("MCP tool returned invalid structured content")
		}
		content.Write(encoded)
	} else {
		for _, item := range result.Content {
			switch value := item.(type) {
			case *mcp.TextContent:
				content.WriteString(value.Text)
				content.WriteByte('\n')
			case *mcp.ResourceLink:
				content.WriteString(value.URI)
				content.WriteByte('\n')
			}
		}
	}
	text := tool.runtime.redactor.Replace(content.String())
	if len(text) > MaxMCPResultBytes {
		return "", false, errors.New("MCP tool result exceeded the size limit")
	}
	var structured any
	if common.UnmarshalJsonStr(text, &structured) == nil {
		encoded, err := common.Marshal(redactMCPValue(structured, tool.runtime.redactor, 0))
		if err != nil {
			return "", false, errors.New("MCP result could not be sanitized")
		}
		text = string(encoded)
	}
	if strings.TrimSpace(text) == "" {
		return "", true, errors.New("MCP tool returned no readable content")
	}
	return text, result.IsError, nil
}

func (tool *MCPRunTool) ValidateArguments(arguments map[string]any) error {
	if arguments == nil || tool.schema.Validate(arguments) != nil {
		return errors.New("MCP tool arguments do not match the approved input schema")
	}
	return nil
}

// PreviewArguments returns a sanitized copy; it never mutates the actual call.
func (tool *MCPRunTool) PreviewArguments(arguments map[string]any) map[string]any {
	return redactMCPValue(arguments, tool.runtime.redactor, 0).(map[string]any)
}

func redactMCPValue(value any, redactor *strings.Replacer, depth int) any {
	if depth > 24 {
		return "[truncated]"
	}
	switch current := value.(type) {
	case map[string]any:
		result := make(map[string]any, len(current))
		for key, child := range current {
			normalized := strings.ToLower(strings.NewReplacer("-", "", "_", "").Replace(key))
			if slices.Contains([]string{"authorization", "apikey", "accesstoken", "refreshtoken", "password", "secret", "clientsecret", "credential", "credentials", "cookie", "setcookie", "token"}, normalized) {
				result[key] = "[redacted]"
			} else {
				result[key] = redactMCPValue(child, redactor, depth+1)
			}
		}
		return result
	case []any:
		result := make([]any, len(current))
		for index, child := range current {
			result[index] = redactMCPValue(child, redactor, depth+1)
		}
		return result
	case string:
		return redactor.Replace(current)
	default:
		return value
	}
}

func truncateMCPText(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	runes := []rune(text)
	return string(runes[:min(len(runes), limit/4)]) + "…"
}
