package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const (
	MaxMCPServers       = 32
	MaxMCPTools         = 64
	MaxMCPToolArguments = 32 * 1024
	MaxMCPResultBytes   = 128 * 1024
	MaxMCPResultPreview = 8 * 1024
)

var ErrMCPConfiguration = errors.New("invalid MCP configuration")

type MCPToolConfig struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Enabled     bool   `json:"enabled"`
	ReadOnly    bool   `json:"read_only"`
	Kind        string `json:"kind"`
	SchemaHash  string `json:"schema_hash"`
}

type MCPCredentials struct {
	Headers map[string]string `json:"headers,omitempty"`
	Query   map[string]string `json:"query,omitempty"`
}

type MCPServerConfig struct {
	ID             int             `json:"id"`
	Name           string          `json:"name"`
	URL            string          `json:"url"`
	Enabled        bool            `json:"enabled"`
	Groups         []string        `json:"groups"`
	Tools          []MCPToolConfig `json:"tools"`
	TimeoutSeconds int             `json:"timeout_seconds"`
	MaxConcurrency int             `json:"max_concurrency"`
	Revision       int64           `json:"revision"`
	CredentialSet  bool            `json:"credential_set"`
	// A missing field preserves credentials; an empty object clears them.
	Credentials *MCPCredentials `json:"credentials,omitempty"`
}

type MCPToolInfo struct {
	ID          string          `json:"id"`
	ServerID    int             `json:"server_id"`
	ServerName  string          `json:"server_name"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
	SchemaHash  string          `json:"schema_hash"`
	ReadOnly    bool            `json:"read_only"`
	Kind        string          `json:"kind"`
}

func MCPServerView(server model.MCPServer) (MCPServerConfig, error) {
	view := MCPServerConfig{
		ID: server.ID, Name: server.Name, URL: server.URL, Enabled: server.Enabled,
		TimeoutSeconds: server.TimeoutSeconds, MaxConcurrency: server.MaxConcurrency,
		Revision: server.Revision, CredentialSet: server.EncryptedCredentials != "",
		Groups: []string{}, Tools: []MCPToolConfig{},
	}
	if err := common.UnmarshalJsonStr(server.GroupsJSON, &view.Groups); err != nil {
		return view, fmt.Errorf("%w: invalid stored groups", ErrMCPConfiguration)
	}
	if err := common.UnmarshalJsonStr(server.ToolsJSON, &view.Tools); err != nil {
		return view, fmt.Errorf("%w: invalid stored tools", ErrMCPConfiguration)
	}
	return view, nil
}

func PrepareMCPServer(input MCPServerConfig, previous *model.MCPServer) (*model.MCPServer, error) {
	input.Name = strings.TrimSpace(input.Name)
	input.URL = strings.TrimSpace(input.URL)
	if input.Name == "" || len([]rune(input.Name)) > 100 {
		return nil, fmt.Errorf("%w: name must contain 1–100 characters", ErrMCPConfiguration)
	}
	endpoint, err := url.Parse(input.URL)
	if err != nil || endpoint.Host == "" || endpoint.User != nil ||
		(endpoint.Scheme != "https" && endpoint.Scheme != "http") ||
		endpoint.Fragment != "" || endpoint.RawQuery != "" || len(input.URL) > 2048 {
		return nil, fmt.Errorf("%w: use an HTTP(S) endpoint without credentials or query parameters; configure authentication in credentials", ErrMCPConfiguration)
	}
	if input.TimeoutSeconds < 1 || input.TimeoutSeconds > 120 ||
		input.MaxConcurrency < 1 || input.MaxConcurrency > 8 {
		return nil, fmt.Errorf("%w: timeout must be 1–120 seconds and concurrency 1–8", ErrMCPConfiguration)
	}
	if len(input.Groups) == 0 || len(input.Groups) > 64 || len(input.Tools) > MaxMCPTools {
		return nil, fmt.Errorf("%w: select 1–64 user groups and at most 64 tools", ErrMCPConfiguration)
	}
	for _, group := range input.Groups {
		if strings.TrimSpace(group) == "" || len(group) > 128 || group == "*" {
			return nil, fmt.Errorf("%w: use explicit user group names", ErrMCPConfiguration)
		}
	}
	seen := make(map[string]bool)
	for _, tool := range input.Tools {
		if tool.Name == "" || len(tool.Name) > 128 || seen[tool.Name] || len(tool.Description) > 4096 ||
			!slices.Contains([]string{"search", "fetch", "tool"}, tool.Kind) {
			return nil, fmt.Errorf("%w: invalid or duplicate tool", ErrMCPConfiguration)
		}
		seen[tool.Name] = true
		if tool.Enabled && (!tool.ReadOnly || len(tool.SchemaHash) != 64) {
			return nil, fmt.Errorf("%w: discover tools and confirm read-only access before enabling them", ErrMCPConfiguration)
		}
	}
	groups, err := common.Marshal(input.Groups)
	if err != nil {
		return nil, err
	}
	tools, err := common.Marshal(input.Tools)
	if err != nil {
		return nil, err
	}
	server := &model.MCPServer{
		ID: input.ID, Name: input.Name, URL: input.URL, Enabled: input.Enabled,
		GroupsJSON: string(groups), ToolsJSON: string(tools),
		TimeoutSeconds: input.TimeoutSeconds, MaxConcurrency: input.MaxConcurrency, Revision: input.Revision,
	}
	if previous != nil {
		server.EncryptedCredentials = previous.EncryptedCredentials
		server.CreatedAt = previous.CreatedAt
	}
	if input.Credentials == nil {
		if previous != nil && previous.URL != input.URL && previous.EncryptedCredentials != "" {
			return nil, fmt.Errorf("%w: replace or clear credentials when changing the endpoint", ErrMCPConfiguration)
		}
		return server, nil
	}
	server.EncryptedCredentials = ""
	if len(input.Credentials.Headers) == 0 && len(input.Credentials.Query) == 0 {
		return server, nil
	}
	if endpoint.Scheme != "https" {
		return nil, fmt.Errorf("%w: MCP credentials require an HTTPS endpoint", ErrMCPConfiguration)
	}
	// A process-random secret would make durable credentials unreadable after restart.
	if os.Getenv("CRYPTO_SECRET") == "" && os.Getenv("SESSION_SECRET") == "" {
		return nil, fmt.Errorf("%w: configure a persistent CRYPTO_SECRET before storing MCP credentials", ErrMCPConfiguration)
	}
	if len(input.Credentials.Headers) > 16 || len(input.Credentials.Query) > 16 {
		return nil, fmt.Errorf("%w: too many authentication fields", ErrMCPConfiguration)
	}
	for name, value := range input.Credentials.Headers {
		canonical := http.CanonicalHeaderKey(name)
		if !validMCPHeaderName(name) || len(value) > 4096 || strings.ContainsAny(value, "\r\n") ||
			slices.Contains([]string{"Host", "Content-Length", "Content-Type", "Accept", "Connection", "Cookie", "Proxy-Authorization"}, canonical) ||
			strings.HasPrefix(strings.ToLower(name), "mcp-") {
			return nil, fmt.Errorf("%w: invalid authentication header", ErrMCPConfiguration)
		}
	}
	for name, value := range input.Credentials.Query {
		if name == "" || len(name) > 128 || len(value) > 4096 {
			return nil, fmt.Errorf("%w: invalid authentication query parameter", ErrMCPConfiguration)
		}
	}
	encoded, err := common.Marshal(input.Credentials)
	if err != nil {
		return nil, err
	}
	server.EncryptedCredentials, err = common.EncryptWithCryptoSecret(string(encoded))
	return server, err
}

func validMCPHeaderName(name string) bool {
	if name == "" || len(name) > 128 {
		return false
	}
	for _, char := range name {
		if char > unicode.MaxASCII || !(unicode.IsLetter(char) || unicode.IsDigit(char) || strings.ContainsRune("!#$%&'*+-.^_\x60|~", char)) {
			return false
		}
	}
	return true
}

func MCPToolID(serverID int, name string) string {
	return fmt.Sprintf("%d:%s", serverID, name)
}

func ListAvailableMCPTools(group string) ([]MCPToolInfo, error) {
	servers, err := model.ListMCPServers()
	if err != nil {
		return nil, err
	}
	tools := make([]MCPToolInfo, 0)
	for _, server := range servers {
		view, err := MCPServerView(server)
		if err != nil {
			return nil, err
		}
		if !view.Enabled || !slices.Contains(view.Groups, group) {
			continue
		}
		for _, tool := range view.Tools {
			if tool.Enabled && tool.ReadOnly {
				tools = append(tools, MCPToolInfo{
					ID: MCPToolID(server.ID, tool.Name), ServerID: server.ID, ServerName: server.Name,
					Name: tool.Name, Description: tool.Description, ReadOnly: true, Kind: tool.Kind,
				})
			}
		}
	}
	return tools, nil
}
