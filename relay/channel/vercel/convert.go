package vercel

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
)

func convertOpenAIRequest(request *dto.GeneralOpenAIRequest, clientName string) (*languageModelRequest, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	if request.N != nil && *request.N != 1 {
		return nil, errors.New("Vercel AI Gateway language-model protocol only supports n=1")
	}

	prompt, err := convertPrompt(request)
	if err != nil {
		return nil, err
	}
	stopSequences, err := convertStopSequences(request.Stop)
	if err != nil {
		return nil, err
	}
	responseFormat, err := convertResponseFormat(request.ResponseFormat)
	if err != nil {
		return nil, err
	}
	toolChoice, err := convertToolChoice(request.ToolChoice)
	if err != nil {
		return nil, err
	}

	result := &languageModelRequest{
		Prompt:           prompt,
		Temperature:      request.Temperature,
		StopSequences:    stopSequences,
		TopP:             request.TopP,
		TopK:             request.TopK,
		PresencePenalty:  request.PresencePenalty,
		FrequencyPenalty: request.FrequencyPenalty,
		ResponseFormat:   responseFormat,
		Seed:             request.Seed,
		ToolChoice:       toolChoice,
		Headers: map[string]string{
			"user-agent": clientName + "/0.0.3",
			"x-title":    clientName,
		},
	}
	if request.MaxCompletionTokens != nil {
		result.MaxOutputTokens = request.MaxCompletionTokens
	} else {
		result.MaxOutputTokens = request.MaxTokens
	}

	for _, tool := range request.Tools {
		if tool.Type != "function" {
			return nil, fmt.Errorf("unsupported Vercel AI Gateway tool type %q", tool.Type)
		}
		inputSchema := tool.Function.Parameters
		if inputSchema == nil {
			inputSchema = map[string]any{"type": "object", "properties": map[string]any{}}
		}
		result.Tools = append(result.Tools, languageModelTool{
			Type:        "function",
			Name:        tool.Function.Name,
			Description: tool.Function.Description,
			InputSchema: inputSchema,
		})
	}
	return result, nil
}

func convertPrompt(request *dto.GeneralOpenAIRequest) ([]languageModelMessage, error) {
	messages := request.Messages
	if len(messages) == 0 && request.Prompt != nil {
		text, err := promptText(request.Prompt)
		if err != nil {
			return nil, err
		}
		messages = []dto.Message{{Role: "user", Content: text}}
	}

	toolNames := make(map[string]string)
	prompt := make([]languageModelMessage, 0, len(messages))
	for i := range messages {
		message := &messages[i]
		switch message.Role {
		case "system", "developer":
			parts, err := convertMessageParts(message)
			if err != nil {
				return nil, err
			}
			var text strings.Builder
			for _, part := range parts {
				if part.Type != "text" {
					return nil, errors.New("Vercel AI Gateway system messages only support text content")
				}
				text.WriteString(part.Text)
			}
			prompt = append(prompt, languageModelMessage{Role: "system", Content: text.String()})
		case "user":
			parts, err := convertMessageParts(message)
			if err != nil {
				return nil, err
			}
			prompt = append(prompt, languageModelMessage{Role: "user", Content: parts})
		case "assistant":
			parts, err := convertMessageParts(message)
			if err != nil {
				return nil, err
			}
			if reasoning := message.GetReasoningContent(); reasoning != "" {
				parts = append(parts, languageModelPart{Type: "reasoning", Text: reasoning})
			}
			for _, call := range message.ParseToolCalls() {
				if strings.TrimSpace(call.ID) == "" || strings.TrimSpace(call.Function.Name) == "" {
					return nil, errors.New("Vercel AI Gateway assistant tool calls require id and function name")
				}
				var input any = map[string]any{}
				if strings.TrimSpace(call.Function.Arguments) != "" {
					if err := common.Unmarshal([]byte(call.Function.Arguments), &input); err != nil {
						return nil, fmt.Errorf("invalid arguments for tool %q: %w", call.Function.Name, err)
					}
				}
				toolNames[call.ID] = call.Function.Name
				parts = append(parts, languageModelPart{
					Type:       "tool-call",
					ToolCallID: call.ID,
					ToolName:   call.Function.Name,
					Input:      input,
				})
			}
			prompt = append(prompt, languageModelMessage{Role: "assistant", Content: parts})
		case "tool":
			toolName := toolNames[message.ToolCallId]
			if message.Name != nil && strings.TrimSpace(*message.Name) != "" {
				toolName = strings.TrimSpace(*message.Name)
			}
			if toolName == "" {
				return nil, fmt.Errorf("tool result %q has no matching tool name", message.ToolCallId)
			}
			text := message.StringContent()
			var value any
			outputType := "text"
			if err := common.Unmarshal([]byte(text), &value); err == nil {
				outputType = "json"
			} else {
				value = text
			}
			prompt = append(prompt, languageModelMessage{
				Role: "tool",
				Content: []languageModelPart{{
					Type:       "tool-result",
					ToolCallID: message.ToolCallId,
					ToolName:   toolName,
					Output:     &languageModelToolOutput{Type: outputType, Value: value},
				}},
			})
		default:
			return nil, fmt.Errorf("unsupported Vercel AI Gateway message role %q", message.Role)
		}
	}
	return prompt, nil
}

func convertMessageParts(message *dto.Message) ([]languageModelPart, error) {
	media := message.ParseContent()
	parts := make([]languageModelPart, 0, len(media))
	for _, item := range media {
		switch item.Type {
		case dto.ContentTypeText:
			parts = append(parts, languageModelPart{Type: "text", Text: item.Text})
		case dto.ContentTypeImageURL:
			image := item.GetImageMedia()
			if image == nil || strings.TrimSpace(image.Url) == "" {
				return nil, errors.New("image_url content is missing a URL")
			}
			parts = append(parts, languageModelPart{
				Type:      "file",
				Data:      image.Url,
				MediaType: inferMediaType(image.Url, image.MimeType, "image/*"),
			})
		case dto.ContentTypeInputAudio:
			audio := item.GetInputAudio()
			if audio == nil || strings.TrimSpace(audio.Data) == "" {
				return nil, errors.New("input_audio content is missing data")
			}
			mediaType := ""
			if strings.TrimSpace(audio.Format) != "" {
				mediaType = "audio/" + strings.TrimSpace(audio.Format)
			}
			parts = append(parts, languageModelPart{
				Type:      "file",
				Data:      audio.Data,
				MediaType: inferMediaType(audio.Data, mediaType, "audio/*"),
			})
		case dto.ContentTypeFile:
			file := item.GetFile()
			if file == nil || strings.TrimSpace(file.FileData) == "" {
				return nil, errors.New("Vercel AI Gateway file content requires inline data or a URL")
			}
			parts = append(parts, languageModelPart{
				Type:      "file",
				Data:      file.FileData,
				MediaType: inferMediaType(file.FileData, "", "application/octet-stream"),
				Filename:  file.FileName,
			})
		case dto.ContentTypeVideoUrl:
			video := item.GetVideoUrl()
			if video == nil || strings.TrimSpace(video.Url) == "" {
				return nil, errors.New("video_url content is missing a URL")
			}
			parts = append(parts, languageModelPart{
				Type:      "file",
				Data:      video.Url,
				MediaType: inferMediaType(video.Url, "", "video/*"),
			})
		default:
			return nil, fmt.Errorf("unsupported Vercel AI Gateway content type %q", item.Type)
		}
	}
	return parts, nil
}

func inferMediaType(data, explicit, fallback string) string {
	if strings.TrimSpace(explicit) != "" {
		return strings.TrimSpace(explicit)
	}
	if strings.HasPrefix(data, "data:") {
		value := strings.TrimPrefix(data, "data:")
		if end := strings.IndexAny(value, ";,"); end > 0 {
			return value[:end]
		}
	}
	return fallback
}

func promptText(value any) (string, error) {
	switch prompt := value.(type) {
	case string:
		return prompt, nil
	case []any:
		var text strings.Builder
		for _, item := range prompt {
			part, ok := item.(string)
			if !ok {
				return "", errors.New("Vercel AI Gateway completion prompts must contain strings")
			}
			text.WriteString(part)
		}
		return text.String(), nil
	default:
		return "", fmt.Errorf("unsupported Vercel AI Gateway prompt type %T", value)
	}
}

func convertStopSequences(value any) ([]string, error) {
	if value == nil {
		return nil, nil
	}
	switch stop := value.(type) {
	case string:
		return []string{stop}, nil
	case []string:
		return stop, nil
	case []any:
		result := make([]string, 0, len(stop))
		for _, item := range stop {
			text, ok := item.(string)
			if !ok {
				return nil, errors.New("Vercel AI Gateway stop sequences must be strings")
			}
			result = append(result, text)
		}
		return result, nil
	default:
		return nil, fmt.Errorf("unsupported Vercel AI Gateway stop type %T", value)
	}
}

func convertResponseFormat(format *dto.ResponseFormat) (*languageResponseFormat, error) {
	if format == nil || format.Type == "" {
		return nil, nil
	}
	switch format.Type {
	case "text":
		return &languageResponseFormat{Type: "text"}, nil
	case "json_object":
		return &languageResponseFormat{Type: "json"}, nil
	case "json_schema":
		var schema dto.FormatJsonSchema
		if err := common.Unmarshal(format.JsonSchema, &schema); err != nil {
			return nil, fmt.Errorf("invalid json_schema response format: %w", err)
		}
		return &languageResponseFormat{
			Type:        "json",
			Schema:      schema.Schema,
			Name:        schema.Name,
			Description: schema.Description,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported Vercel AI Gateway response format %q", format.Type)
	}
}

func convertToolChoice(value any) (*languageModelToolChoice, error) {
	if value == nil {
		return nil, nil
	}
	if choice, ok := value.(string); ok {
		switch choice {
		case "auto", "none", "required":
			return &languageModelToolChoice{Type: choice}, nil
		default:
			return nil, fmt.Errorf("unsupported Vercel AI Gateway tool choice %q", choice)
		}
	}

	choice, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("unsupported Vercel AI Gateway tool choice type %T", value)
	}
	typeName, _ := choice["type"].(string)
	if typeName != "function" {
		return nil, fmt.Errorf("unsupported Vercel AI Gateway tool choice %q", typeName)
	}
	function, ok := choice["function"].(map[string]any)
	if !ok {
		return nil, errors.New("Vercel AI Gateway function tool choice is missing function")
	}
	name, _ := function["name"].(string)
	if strings.TrimSpace(name) == "" {
		return nil, errors.New("Vercel AI Gateway function tool choice is missing name")
	}
	return &languageModelToolChoice{Type: "tool", ToolName: name}, nil
}
