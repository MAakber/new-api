package controller

import (
	"bytes"
	"encoding/json"
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
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type playgroundDelta struct {
	Content   string `json:"content,omitempty"`
	Reasoning string `json:"reasoning_content,omitempty"`
}

// This ResponseWriter consumes Relay output incrementally without buffering a
// complete model response before the browser sees it. Relay still owns billing,
// retries, provider conversion, authentication and request validation.
type playgroundRoundWriter struct {
	mu         sync.Mutex
	header     http.Header
	status     int
	pending    []byte
	body       bytes.Buffer
	text       strings.Builder
	reasoning  strings.Builder
	calls      map[int]*dto.ToolCallRequest
	round      playgroundRelayRound
	started    time.Time
	firstToken time.Time
	lastToken  time.Time
	finished   bool
	failure    error
	emit       func(playgroundDelta) error
}

func (writer *playgroundRoundWriter) Header() http.Header    { return writer.header }
func (writer *playgroundRoundWriter) WriteHeader(status int) { writer.status = status }
func (writer *playgroundRoundWriter) Flush()                 {}

func (writer *playgroundRoundWriter) Write(data []byte) (int, error) {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if writer.failure != nil {
		return 0, writer.failure
	}
	if writer.status >= 400 || !strings.HasPrefix(writer.header.Get("Content-Type"), "text/event-stream") {
		if writer.body.Len()+len(data) > 2*1024*1024 {
			return 0, errors.New("model response exceeded the size limit")
		}
		return writer.body.Write(data)
	}
	writer.pending = append(writer.pending, data...)
	if len(writer.pending) > 2*1024*1024 {
		return 0, errors.New("model stream event exceeded the size limit")
	}
	for {
		end := bytes.Index(writer.pending, []byte("\n\n"))
		separator := 2
		if end < 0 {
			end, separator = bytes.Index(writer.pending, []byte("\r\n\r\n")), 4
		}
		if end < 0 {
			break
		}
		event := writer.pending[:end]
		writer.pending = writer.pending[end+separator:]
		var dataLines []string
		for line := range strings.SplitSeq(string(event), "\n") {
			if value, ok := strings.CutPrefix(strings.TrimSuffix(line, "\r"), "data:"); ok {
				dataLines = append(dataLines, strings.TrimPrefix(value, " "))
			}
		}
		if len(dataLines) == 0 {
			continue
		}
		if err := writer.consumeEvent(strings.Join(dataLines, "\n")); err != nil {
			writer.failure = err
			return 0, err
		}
	}
	return len(data), nil
}

func (writer *playgroundRoundWriter) consumeEvent(data string) error {
	if data == "[DONE]" {
		writer.finished = true
		return nil
	}
	var chunk struct {
		dto.ChatCompletionsStreamResponse
		RawUsage json.RawMessage `json:"usage"`
		Error    any             `json:"error"`
	}
	if err := common.UnmarshalJsonStr(data, &chunk); err != nil {
		return errors.New("invalid model stream event")
	}
	if chunk.Error != nil {
		encoded, _ := common.Marshal(chunk.Error)
		var upstream types.OpenAIError
		if common.Unmarshal(encoded, &upstream) == nil && upstream.Message != "" {
			return errors.New(upstream.Message)
		}
		return errors.New("model stream returned an error")
	}
	writer.round.Response.Id, writer.round.Response.Model = chunk.Id, chunk.Model
	if len(chunk.RawUsage) > 0 && string(chunk.RawUsage) != "null" {
		writer.round.RawUsage = bytes.Clone(chunk.RawUsage)
	}
	for _, choice := range chunk.Choices {
		if choice.Index != 0 {
			continue
		}
		if choice.FinishReason != nil && *choice.FinishReason != "" {
			writer.finished = true
			writer.round.Response.Choices[0].FinishReason = *choice.FinishReason
		}
		delta := choice.Delta
		content, reasoning := delta.GetContentString(), delta.GetReasoningContent()
		if content != "" || reasoning != "" || len(delta.ToolCalls) > 0 {
			now := time.Now()
			if writer.firstToken.IsZero() {
				writer.firstToken = now
			}
			writer.lastToken = now
		}
		if writer.text.Len()+writer.reasoning.Len()+len(content)+len(reasoning) > 2*1024*1024 {
			return errors.New("model output exceeded the size limit")
		}
		writer.text.WriteString(content)
		writer.reasoning.WriteString(reasoning)
		if content != "" || reasoning != "" {
			if err := writer.emit(playgroundDelta{Content: content, Reasoning: reasoning}); err != nil {
				return err
			}
		}
		if len(delta.Annotations) > 0 {
			citations := collectPlaygroundSources(string(delta.Annotations), "")
			for index := range citations {
				citations[index].Cited = true
			}
			writer.round.Sources = mergePlaygroundSources(writer.round.Sources, citations)
		}
		for _, part := range delta.ToolCalls {
			if part.Index == nil || *part.Index < 0 || *part.Index >= maxPlaygroundToolCalls {
				return errors.New("model returned an invalid tool call index")
			}
			call := writer.calls[*part.Index]
			if call == nil {
				call = &dto.ToolCallRequest{Type: "function"}
				writer.calls[*part.Index] = call
			}
			call.ID += part.ID
			call.Function.Name += part.Function.Name
			call.Function.Arguments += part.Function.Arguments
			if len(call.ID) > 256 || len(call.Function.Name) > 128 || len(call.Function.Arguments) > service.MaxMCPToolArguments {
				return errors.New("model tool call exceeded the size limit")
			}
		}
	}
	return nil
}

func (writer *playgroundRoundWriter) result() (*playgroundRelayRound, *types.NewAPIError) {
	writer.round.Duration = time.Since(writer.started)
	if !writer.firstToken.IsZero() {
		writer.round.FirstToken = writer.firstToken.Sub(writer.started)
		writer.round.GenerationDuration = writer.lastToken.Sub(writer.firstToken)
	}
	if writer.failure != nil {
		return &writer.round, playgroundRunError(writer.failure, http.StatusBadGateway)
	}
	if writer.status >= 400 {
		var response struct {
			Error *types.OpenAIError `json:"error"`
		}
		if common.Unmarshal(writer.body.Bytes(), &response) == nil && response.Error != nil && response.Error.Message != "" {
			return nil, playgroundRunError(errors.New(response.Error.Message), writer.status)
		}
		return nil, playgroundRunError(fmt.Errorf("model request returned HTTP %d", writer.status), writer.status)
	}
	if writer.body.Len() > 0 {
		var raw struct {
			Usage json.RawMessage `json:"usage"`
		}
		if common.Unmarshal(writer.body.Bytes(), &writer.round.Response) != nil ||
			common.Unmarshal(writer.body.Bytes(), &raw) != nil || len(writer.round.Response.Choices) == 0 {
			return nil, playgroundRunError(errors.New("model returned an invalid response"), http.StatusBadGateway)
		}
		writer.round.RawUsage = raw.Usage
		message := writer.round.Response.Choices[0].Message
		writer.round.Sources = collectPlaygroundSources(string(message.Annotations), "")
		for index := range writer.round.Sources {
			writer.round.Sources[index].Cited = true
		}
		if err := writer.emit(playgroundDelta{Content: message.StringContent(), Reasoning: message.GetReasoningContent()}); err != nil {
			return nil, playgroundRunError(err, http.StatusBadGateway)
		}
		return &writer.round, nil
	}
	if !writer.finished {
		return &writer.round, playgroundRunError(errors.New("model stream was interrupted before completion"), http.StatusBadGateway)
	}
	message := &writer.round.Response.Choices[0].Message
	message.Role = "assistant"
	message.SetStringContent(writer.text.String())
	if writer.reasoning.Len() > 0 {
		message.ReasoningContent = common.GetPointer(writer.reasoning.String())
	}
	indexes := make([]int, 0, len(writer.calls))
	for index := range writer.calls {
		indexes = append(indexes, index)
	}
	slices.Sort(indexes)
	calls := make([]dto.ToolCallRequest, 0, len(indexes))
	for _, index := range indexes {
		calls = append(calls, *writer.calls[index])
	}
	if len(calls) > 0 {
		message.SetToolCalls(calls)
	}
	return &writer.round, nil
}

var invokePlaygroundChatRound = invokePlaygroundStreamingRelay

func invokePlaygroundStreamingRelay(parent *gin.Context, request *dto.GeneralOpenAIRequest, emit func(playgroundDelta) error) (*playgroundRelayRound, *types.NewAPIError) {
	body, err := common.Marshal(request)
	if err != nil {
		return nil, playgroundRunError(err, http.StatusBadRequest)
	}
	writer := &playgroundRoundWriter{
		header: make(http.Header), status: http.StatusOK, calls: make(map[int]*dto.ToolCallRequest),
		started: time.Now(), emit: emit,
		round: playgroundRelayRound{Response: dto.OpenAITextResponse{Choices: []dto.OpenAITextResponseChoice{{}}}},
	}
	subContext, _ := gin.CreateTestContext(writer)
	subContext.Request = parent.Request.Clone(parent.Request.Context())
	subContext.Request.Method = http.MethodPost
	subContext.Request.URL = &url.URL{Path: "/pg/chat/completions"}
	subContext.Request.ContentLength = int64(len(body))
	storage, err := common.CreateBodyStorage(body)
	if err != nil {
		return nil, playgroundRunError(err, http.StatusBadRequest)
	}
	defer storage.Close()
	subContext.Keys = make(map[string]any, len(parent.Keys))
	for key, value := range parent.Keys {
		if key != common.KeyBodyStorage && key != common.KeyRequestBody {
			subContext.Keys[key] = value
		}
	}
	subContext.Params = append([]gin.Param(nil), parent.Params...)
	subContext.Set(common.KeyBodyStorage, storage)
	subContext.Request.Body = io.NopCloser(storage)
	Relay(subContext, types.RelayFormatOpenAI)
	return writer.result()
}
