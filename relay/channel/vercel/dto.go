package vercel

import "encoding/json"

type languageModelRequest struct {
	Prompt           []languageModelMessage   `json:"prompt"`
	MaxOutputTokens  *uint                    `json:"maxOutputTokens,omitempty"`
	Temperature      *float64                 `json:"temperature,omitempty"`
	StopSequences    []string                 `json:"stopSequences,omitempty"`
	TopP             *float64                 `json:"topP,omitempty"`
	TopK             *int                     `json:"topK,omitempty"`
	PresencePenalty  *float64                 `json:"presencePenalty,omitempty"`
	FrequencyPenalty *float64                 `json:"frequencyPenalty,omitempty"`
	ResponseFormat   *languageResponseFormat  `json:"responseFormat,omitempty"`
	Seed             *float64                 `json:"seed,omitempty"`
	Tools            []languageModelTool      `json:"tools,omitempty"`
	ToolChoice       *languageModelToolChoice `json:"toolChoice,omitempty"`
	Headers          map[string]string        `json:"headers"`
}

type languageModelMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type languageModelPart struct {
	Type       string                   `json:"type"`
	Text       string                   `json:"text,omitempty"`
	Data       string                   `json:"data,omitempty"`
	MediaType  string                   `json:"mediaType,omitempty"`
	Filename   string                   `json:"filename,omitempty"`
	ToolCallID string                   `json:"toolCallId,omitempty"`
	ToolName   string                   `json:"toolName,omitempty"`
	Input      any                      `json:"input,omitempty"`
	Output     *languageModelToolOutput `json:"output,omitempty"`
}

type languageModelToolOutput struct {
	Type  string `json:"type"`
	Value any    `json:"value"`
}

type languageModelTool struct {
	Type        string `json:"type"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	InputSchema any    `json:"inputSchema"`
}

type languageModelToolChoice struct {
	Type     string `json:"type"`
	ToolName string `json:"toolName,omitempty"`
}

type languageResponseFormat struct {
	Type        string `json:"type"`
	Schema      any    `json:"schema,omitempty"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

type languageModelResponse struct {
	ID                 string          `json:"id"`
	Model              string          `json:"model"`
	Created            any             `json:"created"`
	Content            json.RawMessage `json:"content"`
	FinishReason       json.RawMessage `json:"finishReason"`
	LegacyFinishReason json.RawMessage `json:"finish_reason"`
	Usage              languageUsage   `json:"usage"`
	Error              json.RawMessage `json:"error"`
}

type languageModelResponseContent struct {
	Type       string          `json:"type"`
	Text       string          `json:"text"`
	ToolCallID string          `json:"toolCallId"`
	ID         string          `json:"id"`
	ToolName   string          `json:"toolName"`
	Input      json.RawMessage `json:"input"`
}

type languageUsage struct {
	InputTokens      languageInputTokens  `json:"inputTokens"`
	OutputTokens     languageOutputTokens `json:"outputTokens"`
	Raw              json.RawMessage      `json:"raw"`
	PromptTokens     *int                 `json:"prompt_tokens"`
	CompletionTokens *int                 `json:"completion_tokens"`
}

type languageInputTokens struct {
	Total      *int `json:"total"`
	NoCache    *int `json:"noCache"`
	CacheRead  *int `json:"cacheRead"`
	CacheWrite *int `json:"cacheWrite"`
}

type languageOutputTokens struct {
	Total     *int `json:"total"`
	Text      *int `json:"text"`
	Reasoning *int `json:"reasoning"`
}

type languageRawUsage struct {
	PromptTokens       *int `json:"prompt_tokens"`
	CompletionTokens   *int `json:"completion_tokens"`
	InputTokens        *int `json:"input_tokens"`
	OutputTokens       *int `json:"output_tokens"`
	PromptTokenDetails struct {
		CachedTokens     *int `json:"cached_tokens"`
		CacheWriteTokens *int `json:"cache_write_tokens"`
	} `json:"prompt_tokens_details"`
	CompletionTokenDetails struct {
		ReasoningTokens *int `json:"reasoning_tokens"`
	} `json:"completion_tokens_details"`
}

type languageFinishReason struct {
	Unified string `json:"unified"`
	Raw     string `json:"raw"`
}

type languageStreamPart struct {
	Type               string          `json:"type"`
	ID                 string          `json:"id"`
	ModelID            string          `json:"modelId"`
	Delta              string          `json:"delta"`
	TextDelta          string          `json:"textDelta"`
	ToolCallID         string          `json:"toolCallId"`
	ToolName           string          `json:"toolName"`
	Input              json.RawMessage `json:"input"`
	FinishReason       json.RawMessage `json:"finishReason"`
	LegacyFinishReason json.RawMessage `json:"finish_reason"`
	Usage              languageUsage   `json:"usage"`
	Error              json.RawMessage `json:"error"`
}
