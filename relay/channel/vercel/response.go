package vercel

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func languageModelHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}
	service.CloseResponseBodyGracefully(resp)

	var upstream languageModelResponse
	if err := common.Unmarshal(body, &upstream); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if hasJSONValue(upstream.Error) {
		return nil, types.NewOpenAIError(vercelResponseError(upstream.Error), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}

	content, err := parseResponseContent(upstream.Content)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	var text strings.Builder
	var reasoning strings.Builder
	toolCalls := make([]dto.ToolCallResponse, 0)
	for _, part := range content {
		switch part.Type {
		case "text":
			text.WriteString(part.Text)
		case "reasoning":
			reasoning.WriteString(part.Text)
		case "tool-call":
			arguments, err := toolInputString(part.Input)
			if err != nil {
				return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
			callID := part.ToolCallID
			if callID == "" {
				callID = part.ID
			}
			toolCalls = append(toolCalls, dto.ToolCallResponse{
				ID:   callID,
				Type: "function",
				Function: dto.FunctionResponse{
					Name:      part.ToolName,
					Arguments: arguments,
				},
			})
		}
	}

	usage := usageToOpenAI(upstream.Usage)
	if usage.PromptTokens == 0 && usage.CompletionTokens == 0 && (text.Len() > 0 || reasoning.Len() > 0 || len(toolCalls) > 0) {
		usage = service.ResponseText2Usage(c, text.String()+reasoning.String(), info.UpstreamModelName, info.GetEstimatePromptTokens())
	}

	message := dto.Message{Role: "assistant"}
	if text.Len() > 0 {
		message.SetStringContent(text.String())
	} else {
		message.SetNullContent()
	}
	if reasoning.Len() > 0 {
		value := reasoning.String()
		message.ReasoningContent = &value
	}
	if len(toolCalls) > 0 {
		message.ToolCalls, err = common.Marshal(toolCalls)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
		}
	}

	responseID := upstream.ID
	if responseID == "" {
		responseID = helper.GetResponseID(c)
	}
	model := upstream.Model
	if model == "" {
		model = info.UpstreamModelName
	}
	created := upstream.Created
	if created == nil {
		created = common.GetTimestamp()
	}
	finishReason := parseFinishReason(upstream.FinishReason, upstream.LegacyFinishReason)
	if len(toolCalls) > 0 {
		finishReason = constant.FinishReasonToolCalls
	}
	openAIResponse := &dto.OpenAITextResponse{
		Id:      responseID,
		Model:   model,
		Object:  "chat.completion",
		Created: created,
		Choices: []dto.OpenAITextResponseChoice{{
			Index:        0,
			Message:      message,
			FinishReason: finishReason,
		}},
		Usage: *usage,
	}

	var output any = openAIResponse
	switch info.RelayFormat {
	case types.RelayFormatClaude, types.RelayFormatGemini:
		result, err := relayconvert.ConvertResponse(c, info, info.RelayFormat, openAIResponse)
		if err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
		output = result.Value
	}
	encoded, err := common.Marshal(output)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	service.IOCopyBytesGracefully(c, resp, encoded)
	return usage, nil
}

type streamToolState struct {
	index     int
	deltaSeen bool
	announced bool
	nameSent  bool
}

func languageModelStreamHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	if resp == nil || resp.Body == nil {
		return nil, types.NewOpenAIError(errors.New("empty Vercel AI Gateway response"), types.ErrorCodeBadResponse, http.StatusBadGateway)
	}
	defer service.CloseResponseBodyGracefully(resp)
	helper.SetEventStreamHeaders(c)

	responseID := helper.GetResponseID(c)
	model := info.UpstreamModelName
	created := common.GetTimestamp()
	usage := &dto.Usage{}
	finishReason := constant.FinishReasonStop
	finishReceived := false
	toolStates := make(map[string]*streamToolState)
	nextToolIndex := 0
	var responseText strings.Builder

	start := helper.GenerateStartEmptyResponse(responseID, created, model, nil)
	if err := sendStreamResponse(c, info, start); err != nil {
		return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
	}

	scanner := helper.NewStreamScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "data:") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		} else if strings.HasPrefix(line, "event:") || strings.HasPrefix(line, "id:") || strings.HasPrefix(line, "retry:") || strings.HasPrefix(line, ":") {
			continue
		}
		if line == "DONE" || line == "[DONE]" {
			break
		}

		var part languageStreamPart
		if err := common.Unmarshal([]byte(line), &part); err != nil {
			return usage, types.NewOpenAIError(fmt.Errorf("invalid Vercel AI Gateway stream event: %w", err), types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
		}
		info.SetFirstResponseTime()
		info.ReceivedResponseCount++

		switch part.Type {
		case "response-metadata":
			if part.ID != "" {
				responseID = part.ID
			}
			if part.ModelID != "" {
				model = part.ModelID
			}
		case "text-delta":
			delta := part.Delta
			if delta == "" {
				delta = part.TextDelta
			}
			if delta != "" {
				responseText.WriteString(delta)
				chunk := streamDelta(responseID, created, model)
				chunk.Choices[0].Delta.SetContentString(delta)
				if err := sendStreamResponse(c, info, chunk); err != nil {
					return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
				}
			}
		case "reasoning-delta":
			delta := part.Delta
			if delta == "" {
				delta = part.TextDelta
			}
			if delta != "" {
				responseText.WriteString(delta)
				chunk := streamDelta(responseID, created, model)
				chunk.Choices[0].Delta.SetReasoningContent(delta)
				if err := sendStreamResponse(c, info, chunk); err != nil {
					return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
				}
			}
		case "tool-input-start":
			toolCallID := streamToolCallID(part)
			state := ensureToolState(toolStates, toolCallID, &nextToolIndex)
			state.announced = true
			state.nameSent = part.ToolName != ""
			chunk := toolStreamDelta(responseID, created, model, state.index, toolCallID, part.ToolName, "", true)
			if err := sendStreamResponse(c, info, chunk); err != nil {
				return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
			}
		case "tool-input-delta":
			toolCallID := streamToolCallID(part)
			state := ensureToolState(toolStates, toolCallID, &nextToolIndex)
			state.deltaSeen = true
			arguments := part.Delta
			if arguments == "" {
				arguments = part.TextDelta
			}
			responseText.WriteString(arguments)
			chunk := toolStreamDelta(responseID, created, model, state.index, toolCallID, part.ToolName, arguments, !state.announced)
			state.announced = true
			state.nameSent = state.nameSent || part.ToolName != ""
			if err := sendStreamResponse(c, info, chunk); err != nil {
				return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
			}
		case "tool-call":
			toolCallID := part.ToolCallID
			if toolCallID == "" {
				toolCallID = part.ID
			}
			state := ensureToolState(toolStates, toolCallID, &nextToolIndex)
			if state.deltaSeen {
				if !state.nameSent && part.ToolName != "" {
					chunk := toolStreamDelta(responseID, created, model, state.index, toolCallID, part.ToolName, "", !state.announced)
					state.announced = true
					state.nameSent = true
					if err := sendStreamResponse(c, info, chunk); err != nil {
						return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
					}
				}
				continue
			}
			arguments, err := toolInputString(part.Input)
			if err != nil {
				return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
			}
			responseText.WriteString(arguments)
			chunk := toolStreamDelta(responseID, created, model, state.index, toolCallID, part.ToolName, arguments, true)
			state.announced = true
			state.nameSent = part.ToolName != ""
			if err := sendStreamResponse(c, info, chunk); err != nil {
				return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
			}
		case "finish":
			finishReceived = true
			finishReason = parseFinishReason(part.FinishReason, part.LegacyFinishReason)
			if len(toolStates) > 0 {
				finishReason = constant.FinishReasonToolCalls
			}
			usage = usageToOpenAI(part.Usage)
		case "error":
			return usage, types.NewOpenAIError(vercelResponseError(part.Error), types.ErrorCodeBadResponse, http.StatusBadGateway)
		}
	}
	if err := scanner.Err(); err != nil && err != io.EOF {
		return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	if usage.PromptTokens == 0 && usage.CompletionTokens == 0 && responseText.Len() > 0 {
		usage = service.ResponseText2Usage(c, responseText.String(), info.UpstreamModelName, info.GetEstimatePromptTokens())
	}
	if !finishReceived && len(toolStates) > 0 {
		finishReason = constant.FinishReasonToolCalls
	}
	stop := helper.GenerateStopResponse(responseID, created, model, finishReason)
	stopData, err := common.Marshal(stop)
	if err != nil {
		return usage, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	if info.RelayFormat != types.RelayFormatClaude {
		if err := openai.HandleStreamFormat(c, info, string(stopData), info.ChannelSetting.ForceFormat, info.ChannelSetting.ThinkingToContent); err != nil {
			return usage, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
		}
	}
	openai.HandleFinalResponse(c, info, string(stopData), responseID, created, model, "", usage, false)
	return usage, nil
}

func streamToolCallID(part languageStreamPart) string {
	if part.ToolCallID != "" {
		return part.ToolCallID
	}
	return part.ID
}

func sendStreamResponse(c *gin.Context, info *relaycommon.RelayInfo, response *dto.ChatCompletionsStreamResponse) error {
	data, err := common.Marshal(response)
	if err != nil {
		return err
	}
	return openai.HandleStreamFormat(c, info, string(data), info.ChannelSetting.ForceFormat, info.ChannelSetting.ThinkingToContent)
}

func streamDelta(id string, created int64, model string) *dto.ChatCompletionsStreamResponse {
	return &dto.ChatCompletionsStreamResponse{
		Id:      id,
		Object:  "chat.completion.chunk",
		Created: created,
		Model:   model,
		Choices: []dto.ChatCompletionsStreamResponseChoice{{
			Index: 0,
			Delta: dto.ChatCompletionsStreamResponseChoiceDelta{},
		}},
	}
}

func toolStreamDelta(id string, created int64, model string, index int, callID, name, arguments string, includeIdentity bool) *dto.ChatCompletionsStreamResponse {
	chunk := streamDelta(id, created, model)
	call := dto.ToolCallResponse{
		Function: dto.FunctionResponse{Arguments: arguments},
	}
	call.SetIndex(index)
	if includeIdentity {
		call.ID = callID
		call.Type = "function"
	}
	if name != "" {
		call.Function.Name = name
	}
	chunk.Choices[0].Delta.ToolCalls = []dto.ToolCallResponse{call}
	return chunk
}

func ensureToolState(states map[string]*streamToolState, id string, nextIndex *int) *streamToolState {
	if state := states[id]; state != nil {
		return state
	}
	state := &streamToolState{index: *nextIndex}
	*nextIndex++
	states[id] = state
	return state
}

func parseResponseContent(raw json.RawMessage) ([]languageModelResponseContent, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil, nil
	}
	if strings.HasPrefix(trimmed, "[") {
		var content []languageModelResponseContent
		if err := common.Unmarshal(raw, &content); err != nil {
			return nil, err
		}
		return content, nil
	}
	var content languageModelResponseContent
	if err := common.Unmarshal(raw, &content); err != nil {
		return nil, err
	}
	return []languageModelResponseContent{content}, nil
}

func toolInputString(raw json.RawMessage) (string, error) {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return "{}", nil
	}
	var text string
	if err := common.Unmarshal(raw, &text); err == nil {
		if strings.TrimSpace(text) == "" {
			return "{}", nil
		}
		return text, nil
	}
	var value any
	if err := common.Unmarshal(raw, &value); err != nil {
		return "", fmt.Errorf("invalid Vercel AI Gateway tool input: %w", err)
	}
	return trimmed, nil
}

func usageToOpenAI(upstream languageUsage) *dto.Usage {
	var raw languageRawUsage
	if hasJSONValue(upstream.Raw) {
		_ = common.Unmarshal(upstream.Raw, &raw)
	}
	promptTokens := firstTokenValue(raw.PromptTokens, raw.InputTokens, upstream.PromptTokens, upstream.InputTokens.Total)
	completionTokens := firstTokenValue(raw.CompletionTokens, raw.OutputTokens, upstream.CompletionTokens, upstream.OutputTokens.Total)
	usage := &dto.Usage{
		PromptTokens:     promptTokens,
		CompletionTokens: completionTokens,
		TotalTokens:      promptTokens + completionTokens,
	}
	usage.PromptTokensDetails.CachedTokens = firstTokenValue(raw.PromptTokenDetails.CachedTokens, upstream.InputTokens.CacheRead)
	usage.PromptTokensDetails.CacheWriteTokens = firstTokenValue(raw.PromptTokenDetails.CacheWriteTokens, upstream.InputTokens.CacheWrite)
	usage.CompletionTokenDetails.ReasoningTokens = firstTokenValue(raw.CompletionTokenDetails.ReasoningTokens, upstream.OutputTokens.Reasoning)
	return usage
}

func firstTokenValue(values ...*int) int {
	for _, value := range values {
		if value != nil {
			if *value < 0 {
				return 0
			}
			return *value
		}
	}
	return 0
}

func parseFinishReason(primary, legacy json.RawMessage) string {
	raw := primary
	if !hasJSONValue(raw) {
		raw = legacy
	}
	var value string
	if err := common.Unmarshal(raw, &value); err == nil {
		return normalizeFinishReason(value)
	}
	var reason languageFinishReason
	if err := common.Unmarshal(raw, &reason); err == nil {
		if reason.Unified != "" {
			return normalizeFinishReason(reason.Unified)
		}
		return normalizeFinishReason(reason.Raw)
	}
	return constant.FinishReasonStop
}

func normalizeFinishReason(reason string) string {
	switch strings.ToLower(strings.TrimSpace(reason)) {
	case "tool-calls", "tool_calls", "function_call":
		return constant.FinishReasonToolCalls
	case "length", "max-tokens", "max_tokens":
		return constant.FinishReasonLength
	case "content-filter", "content_filter":
		return constant.FinishReasonContentFilter
	case "stop", "":
		return constant.FinishReasonStop
	default:
		return reason
	}
}

func hasJSONValue(raw json.RawMessage) bool {
	value := strings.TrimSpace(string(raw))
	return value != "" && value != "null" && value != "{}"
}

func vercelResponseError(raw json.RawMessage) error {
	var value struct {
		Message string `json:"message"`
	}
	if err := common.Unmarshal(raw, &value); err == nil && value.Message != "" {
		return errors.New(value.Message)
	}
	message := strings.TrimSpace(string(raw))
	if message == "" || message == "null" {
		message = "Vercel AI Gateway returned an unknown error"
	}
	return errors.New(message)
}
