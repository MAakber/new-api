package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
)

const (
	upstreamInterceptionSessionKey      = "upstream_interception_session"
	upstreamInterceptionErrorWrittenKey = "upstream_interception_error_written"
	upstreamInterceptionMaxPendingBytes = 1 << 20
)

var errUpstreamInterceptionBlocked = errors.New("upstream response intercepted")

type upstreamInterceptionError struct {
	message   string
	retry     bool
	committed bool
}

func (e *upstreamInterceptionError) Error() string { return e.message }

type interceptionTextRef struct {
	value string
	set   func(string)
}

type interceptionPacket struct {
	raw       []byte
	prefix    []byte
	suffix    []byte
	payload   any
	dirty     bool
	primary   []*interceptionTextRef
	mirrors   []*interceptionTextRef
	textRunes int
}

func (p *interceptionPacket) bytes() []byte {
	if !p.dirty || p.payload == nil {
		return p.raw
	}
	payload, err := json.Marshal(p.payload)
	if err != nil {
		return p.raw
	}
	result := make([]byte, 0, len(p.prefix)+len(payload)+len(p.suffix))
	result = append(result, p.prefix...)
	result = append(result, payload...)
	result = append(result, p.suffix...)
	return result
}

func (p *interceptionPacket) refreshTextRunes() {
	p.textRunes = 0
	for _, ref := range p.primary {
		p.textRunes += utf8.RuneCountInString(ref.value)
	}
}

type upstreamInterceptionWriter struct {
	gin.ResponseWriter
	snapshot       *setting.UpstreamInterceptionSnapshot
	config         setting.UpstreamInterceptionConfig
	relayFormat    types.RelayFormat
	originalHeader http.Header
	status         int
	size           int
	stream         bool
	committed      bool
	wroteBody      bool
	input          bytes.Buffer
	pending        []*interceptionPacket
	flushErr       error
	blocked        bool
	matched        bool
	releasedText   bool
	matchedRules   map[string]struct{}
}

func BeginUpstreamInterception(c *gin.Context, relayFormat types.RelayFormat, channelID int, stream bool) bool {
	if c == nil || c.Writer == nil || !isSupportedUpstreamInterceptionFormat(relayFormat) {
		return false
	}
	snapshot := setting.GetUpstreamInterceptionSnapshot(channelID)
	if snapshot == nil {
		return false
	}
	if getUpstreamInterceptionWriter(c) != nil {
		return false
	}
	writer := &upstreamInterceptionWriter{
		ResponseWriter: c.Writer,
		snapshot:       snapshot,
		config:         snapshot.Config(),
		relayFormat:    relayFormat,
		originalHeader: c.Writer.Header().Clone(),
		status:         c.Writer.Status(),
		size:           -1,
		stream:         stream,
		matchedRules:   make(map[string]struct{}),
	}
	c.Set(upstreamInterceptionSessionKey, writer)
	c.Writer = writer
	return true
}

func FinishUpstreamInterception(c *gin.Context) *types.NewAPIError {
	writer := getUpstreamInterceptionWriter(c)
	if writer == nil {
		return nil
	}
	if err := writer.finish(); err != nil {
		return writer.newAPIError(c)
	}
	restoreUpstreamInterceptionWriter(c, writer, false)
	return nil
}

func AbortUpstreamInterception(c *gin.Context) {
	writer := getUpstreamInterceptionWriter(c)
	if writer == nil {
		return
	}
	restoreUpstreamInterceptionWriter(c, writer, !writer.committed)
}

func IsUpstreamInterceptionError(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	var interceptionErr *upstreamInterceptionError
	return errors.As(err, &interceptionErr)
}

func ShouldRetryUpstreamInterception(err *types.NewAPIError) bool {
	if err == nil {
		return false
	}
	var interceptionErr *upstreamInterceptionError
	return errors.As(err, &interceptionErr) && interceptionErr.retry && !interceptionErr.committed
}

func UpstreamInterceptionErrorAlreadyWritten(c *gin.Context) bool {
	return c != nil && c.GetBool(upstreamInterceptionErrorWrittenKey)
}

func isSupportedUpstreamInterceptionFormat(format types.RelayFormat) bool {
	switch format {
	case types.RelayFormatOpenAI, types.RelayFormatClaude, types.RelayFormatGemini,
		types.RelayFormatOpenAIResponses, types.RelayFormatOpenAIResponsesCompaction:
		return true
	default:
		return false
	}
}

func getUpstreamInterceptionWriter(c *gin.Context) *upstreamInterceptionWriter {
	if c == nil {
		return nil
	}
	value, exists := c.Get(upstreamInterceptionSessionKey)
	if !exists {
		return nil
	}
	writer, _ := value.(*upstreamInterceptionWriter)
	return writer
}

func restoreUpstreamInterceptionWriter(c *gin.Context, writer *upstreamInterceptionWriter, restoreHeader bool) {
	if restoreHeader {
		header := writer.ResponseWriter.Header()
		for key := range header {
			delete(header, key)
		}
		for key, values := range writer.originalHeader {
			header[key] = append([]string(nil), values...)
		}
		c.Set("event_stream_headers_set", false)
	}
	c.Writer = writer.ResponseWriter
	c.Set(upstreamInterceptionSessionKey, nil)
}

func (w *upstreamInterceptionWriter) WriteHeader(code int) {
	if code > 0 && !w.committed {
		w.status = code
	}
}

func (w *upstreamInterceptionWriter) WriteHeaderNow() {
	if w.size < 0 {
		w.size = 0
	}
}

func (w *upstreamInterceptionWriter) Write(data []byte) (int, error) {
	if w.size < 0 {
		w.size = 0
	}
	w.size += len(data)
	if w.blocked {
		return len(data), errUpstreamInterceptionBlocked
	}
	_, _ = w.input.Write(data)
	return len(data), nil
}

func (w *upstreamInterceptionWriter) WriteString(data string) (int, error) {
	return w.Write([]byte(data))
}

func (w *upstreamInterceptionWriter) Status() int { return w.status }

func (w *upstreamInterceptionWriter) Size() int { return w.size }

func (w *upstreamInterceptionWriter) Written() bool { return w.size >= 0 }

func (w *upstreamInterceptionWriter) Flush() {
	w.stream = true
	if w.blocked {
		w.flushErr = errUpstreamInterceptionBlocked
		return
	}
	if err := w.consumeStreamInput(true); err != nil {
		w.flushErr = err
		return
	}
	if err := w.releaseSafePackets(); err != nil {
		w.flushErr = err
		return
	}
	if w.committed {
		w.ResponseWriter.Flush()
	}
}

func (w *upstreamInterceptionWriter) FlushError() error { return w.flushErr }

func (w *upstreamInterceptionWriter) finish() error {
	if w.blocked {
		return errUpstreamInterceptionBlocked
	}
	if w.stream {
		if err := w.consumeStreamInput(false); err != nil {
			return err
		}
	} else if w.input.Len() > 0 {
		w.addPacket(newInterceptionPacket(w.input.Bytes(), false, w.relayFormat))
		w.input.Reset()
	}
	if w.blocked {
		return errUpstreamInterceptionBlocked
	}
	if w.matched && w.config.Action == setting.UpstreamInterceptionActionRemove && !w.hasVisibleText() {
		w.blocked = true
		return errUpstreamInterceptionBlocked
	}
	for len(w.pending) > 0 {
		packet := w.pending[0]
		w.pending = w.pending[1:]
		if err := w.writePacket(packet); err != nil {
			return err
		}
	}
	if w.stream && w.committed {
		w.ResponseWriter.Flush()
	}
	return nil
}

func (w *upstreamInterceptionWriter) newAPIError(c *gin.Context) *types.NewAPIError {
	config := w.config
	committed := w.committed
	if committed && w.stream {
		w.writeStreamError(config)
		c.Set(upstreamInterceptionErrorWrittenKey, true)
	}
	if len(w.matchedRules) > 0 {
		rules := make([]string, 0, len(w.matchedRules))
		for name := range w.matchedRules {
			rules = append(rules, name)
		}
		sort.Strings(rules)
		common.SetContextKey(c, constant.ContextKeyAdminRejectReason, "upstream_interception_rules="+strings.Join(rules, ","))
	}
	restoreUpstreamInterceptionWriter(c, w, !committed)
	interceptionErr := &upstreamInterceptionError{message: config.ErrorMessage, retry: config.RetryOnBlock, committed: committed}
	options := []types.NewAPIErrorOptions{types.ErrOptionWithNoRecordErrorLog()}
	if !interceptionErr.retry || interceptionErr.committed {
		options = append(options, types.ErrOptionWithSkipRetry())
	}
	return types.NewErrorWithStatusCode(interceptionErr, types.ErrorCode(config.ErrorCode), config.ErrorStatus, options...)
}

func (w *upstreamInterceptionWriter) consumeStreamInput(flush bool) error {
	data := append([]byte(nil), w.input.Bytes()...)
	w.input.Reset()
	for len(data) > 0 {
		end := nextSSEFrameEnd(data)
		if end < 0 {
			if !flush {
				w.addPacket(newInterceptionPacket(data, true, w.relayFormat))
				return nil
			}
			w.input.Write(data)
			return nil
		}
		w.addPacket(newInterceptionPacket(data[:end], true, w.relayFormat))
		if w.blocked {
			return errUpstreamInterceptionBlocked
		}
		data = data[end:]
	}
	return nil
}

func nextSSEFrameEnd(data []byte) int {
	lf := bytes.Index(data, []byte("\n\n"))
	crlf := bytes.Index(data, []byte("\r\n\r\n"))
	switch {
	case lf < 0 && crlf < 0:
		return -1
	case lf < 0:
		return crlf + 4
	case crlf < 0:
		return lf + 2
	case lf < crlf:
		return lf + 2
	default:
		return crlf + 4
	}
}

func (w *upstreamInterceptionWriter) addPacket(packet *interceptionPacket) {
	if packet == nil {
		return
	}
	w.pending = append(w.pending, packet)
	if len(packet.mirrors) > 0 {
		w.applyRules(packet.mirrors)
	}
	if w.blocked {
		return
	}
	primary := make([]*interceptionTextRef, 0)
	for _, pending := range w.pending {
		primary = append(primary, pending.primary...)
	}
	w.applyRules(primary)
	for _, pending := range w.pending {
		pending.refreshTextRunes()
	}
}

func (w *upstreamInterceptionWriter) applyRules(refs []*interceptionTextRef) {
	if len(refs) == 0 || w.blocked {
		return
	}
	var combined strings.Builder
	for _, ref := range refs {
		combined.WriteString(ref.value)
	}
	text := combined.String()
	matches := w.snapshot.FindMatches(text)
	if len(matches) == 0 {
		return
	}
	w.matched = true
	for _, match := range matches {
		w.matchedRules[match.RuleName] = struct{}{}
	}
	if w.config.Action == setting.UpstreamInterceptionActionBlock {
		w.blocked = true
		w.flushErr = errUpstreamInterceptionBlocked
		return
	}
	ranges := mergeInterceptionMatches(matches)
	offset := 0
	for _, ref := range refs {
		start := offset
		end := offset + len(ref.value)
		filtered := removeInterceptionRanges(ref.value, start, end, ranges)
		if filtered != ref.value {
			ref.set(filtered)
		}
		offset = end
	}
}

func mergeInterceptionMatches(matches []setting.UpstreamInterceptionMatch) [][2]int {
	ranges := make([][2]int, 0, len(matches))
	for _, match := range matches {
		if len(ranges) == 0 || match.Start > ranges[len(ranges)-1][1] {
			ranges = append(ranges, [2]int{match.Start, match.End})
			continue
		}
		if match.End > ranges[len(ranges)-1][1] {
			ranges[len(ranges)-1][1] = match.End
		}
	}
	return ranges
}

func removeInterceptionRanges(value string, segmentStart, segmentEnd int, ranges [][2]int) string {
	var result strings.Builder
	local := 0
	for _, span := range ranges {
		start := max(span[0], segmentStart)
		end := min(span[1], segmentEnd)
		if start >= end {
			continue
		}
		start -= segmentStart
		end -= segmentStart
		if start > local {
			result.WriteString(value[local:start])
		}
		local = end
	}
	if local == 0 {
		return value
	}
	result.WriteString(value[local:])
	return result.String()
}

func (w *upstreamInterceptionWriter) releaseSafePackets() error {
	totalRunes := 0
	totalBytes := 0
	for _, packet := range w.pending {
		totalRunes += packet.textRunes
		totalBytes += len(packet.raw)
	}
	for len(w.pending) > 0 {
		first := w.pending[0]
		withinTextWindow := totalRunes-first.textRunes < setting.UpstreamInterceptionWindowRunes
		withinMemoryLimit := totalBytes <= upstreamInterceptionMaxPendingBytes
		if first.textRunes > 0 && withinTextWindow && withinMemoryLimit {
			break
		}
		w.pending = w.pending[1:]
		totalRunes -= first.textRunes
		totalBytes -= len(first.raw)
		if err := w.writePacket(first); err != nil {
			return err
		}
	}
	return nil
}

func (w *upstreamInterceptionWriter) writePacket(packet *interceptionPacket) error {
	if packet == nil {
		return nil
	}
	for _, ref := range packet.primary {
		if strings.TrimSpace(ref.value) != "" {
			w.releasedText = true
			break
		}
	}
	data := packet.bytes()
	if len(data) == 0 {
		return nil
	}
	if !w.committed {
		w.ResponseWriter.Header().Del("Content-Length")
		w.ResponseWriter.WriteHeader(w.status)
		w.committed = true
	}
	_, err := w.ResponseWriter.Write(data)
	if err == nil {
		w.wroteBody = true
	}
	return err
}

func (w *upstreamInterceptionWriter) hasVisibleText() bool {
	if w.releasedText {
		return true
	}
	for _, packet := range w.pending {
		for _, ref := range packet.primary {
			if strings.TrimSpace(ref.value) != "" {
				return true
			}
		}
	}
	return false
}

func (w *upstreamInterceptionWriter) writeStreamError(config setting.UpstreamInterceptionConfig) {
	var payload []byte
	switch w.relayFormat {
	case types.RelayFormatClaude:
		data, _ := json.Marshal(map[string]any{"type": "error", "error": map[string]any{"type": config.ErrorCode, "message": config.ErrorMessage}})
		payload = []byte("event: error\ndata: " + string(data) + "\n\n")
	case types.RelayFormatGemini:
		data, _ := json.Marshal(map[string]any{"error": map[string]any{"code": config.ErrorStatus, "message": config.ErrorMessage, "status": config.ErrorCode}})
		payload = []byte("data: " + string(data) + "\n\n")
	default:
		data, _ := json.Marshal(map[string]any{"error": map[string]any{"message": config.ErrorMessage, "type": "upstream_response_intercepted", "param": "", "code": config.ErrorCode}})
		payload = []byte("data: " + string(data) + "\n\ndata: [DONE]\n\n")
	}
	_, _ = w.ResponseWriter.Write(payload)
	w.ResponseWriter.Flush()
}

func newInterceptionPacket(raw []byte, stream bool, format types.RelayFormat) *interceptionPacket {
	packet := &interceptionPacket{raw: append([]byte(nil), raw...)}
	payload := raw
	if stream {
		start, end, ok := sseJSONPayload(raw)
		if !ok {
			return packet
		}
		packet.prefix = append([]byte(nil), raw[:start]...)
		packet.suffix = append([]byte(nil), raw[end:]...)
		payload = raw[start:end]
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return packet
	}
	packet.payload = value
	extractInterceptionText(packet, format)
	packet.refreshTextRunes()
	return packet
}

func sseJSONPayload(raw []byte) (int, int, bool) {
	lineStart := 0
	for lineStart < len(raw) {
		lineEnd := bytes.IndexByte(raw[lineStart:], '\n')
		if lineEnd < 0 {
			lineEnd = len(raw)
		} else {
			lineEnd += lineStart
		}
		line := raw[lineStart:lineEnd]
		line = bytes.TrimSuffix(line, []byte{'\r'})
		if bytes.HasPrefix(line, []byte("data:")) {
			start := lineStart + len("data:")
			if start < lineEnd && raw[start] == ' ' {
				start++
			}
			end := lineEnd
			if end > start && raw[end-1] == '\r' {
				end--
			}
			trimmed := bytes.TrimSpace(raw[start:end])
			if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("[DONE]")) || trimmed[0] != '{' {
				return 0, 0, false
			}
			for start < end && (raw[start] == ' ' || raw[start] == '\t') {
				start++
			}
			for end > start && (raw[end-1] == ' ' || raw[end-1] == '\t' || raw[end-1] == '\r') {
				end--
			}
			return start, end, true
		}
		if lineEnd == len(raw) {
			break
		}
		lineStart = lineEnd + 1
	}
	return 0, 0, false
}

func extractInterceptionText(packet *interceptionPacket, format types.RelayFormat) {
	root, ok := packet.payload.(map[string]any)
	if !ok {
		return
	}
	switch format {
	case types.RelayFormatClaude:
		extractClaudeInterceptionText(packet, root)
	case types.RelayFormatGemini:
		extractGeminiInterceptionText(packet, root)
	case types.RelayFormatOpenAIResponses, types.RelayFormatOpenAIResponsesCompaction:
		extractResponsesInterceptionText(packet, root)
	default:
		extractOpenAIInterceptionText(packet, root)
	}
}

func appendStringRef(packet *interceptionPacket, target *[]*interceptionTextRef, object map[string]any, key string) {
	value, ok := object[key].(string)
	if !ok {
		return
	}
	ref := &interceptionTextRef{value: value}
	ref.set = func(next string) {
		object[key] = next
		ref.value = next
		packet.dirty = true
	}
	*target = append(*target, ref)
}

func appendContentRefs(packet *interceptionPacket, target *[]*interceptionTextRef, object map[string]any, key string) {
	if _, ok := object[key].(string); ok {
		appendStringRef(packet, target, object, key)
		return
	}
	items, ok := object[key].([]any)
	if !ok {
		return
	}
	for _, item := range items {
		part, ok := item.(map[string]any)
		if !ok {
			continue
		}
		partType, _ := part["type"].(string)
		if partType == "text" || partType == "output_text" {
			appendStringRef(packet, target, part, "text")
		}
	}
}

func extractOpenAIInterceptionText(packet *interceptionPacket, root map[string]any) {
	choices, _ := root["choices"].([]any)
	for _, item := range choices {
		choice, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if delta, ok := choice["delta"].(map[string]any); ok {
			appendContentRefs(packet, &packet.primary, delta, "content")
		}
		if message, ok := choice["message"].(map[string]any); ok {
			appendContentRefs(packet, &packet.primary, message, "content")
		}
		appendStringRef(packet, &packet.primary, choice, "text")
	}
}

func extractClaudeInterceptionText(packet *interceptionPacket, root map[string]any) {
	eventType, _ := root["type"].(string)
	switch eventType {
	case "content_block_delta":
		if delta, ok := root["delta"].(map[string]any); ok {
			if deltaType, _ := delta["type"].(string); deltaType == "text_delta" || deltaType == "" {
				appendStringRef(packet, &packet.primary, delta, "text")
			}
		}
	case "content_block_start":
		if block, ok := root["content_block"].(map[string]any); ok {
			if blockType, _ := block["type"].(string); blockType == "text" || blockType == "" {
				appendStringRef(packet, &packet.primary, block, "text")
			}
		}
	default:
		if content, ok := root["content"].([]any); ok {
			for _, item := range content {
				part, ok := item.(map[string]any)
				if !ok {
					continue
				}
				if partType, _ := part["type"].(string); partType == "text" || partType == "" {
					appendStringRef(packet, &packet.primary, part, "text")
				}
			}
		}
		appendStringRef(packet, &packet.primary, root, "completion")
	}
}

func extractGeminiInterceptionText(packet *interceptionPacket, root map[string]any) {
	candidates, _ := root["candidates"].([]any)
	for _, item := range candidates {
		candidate, ok := item.(map[string]any)
		if !ok {
			continue
		}
		content, _ := candidate["content"].(map[string]any)
		parts, _ := content["parts"].([]any)
		for _, rawPart := range parts {
			part, ok := rawPart.(map[string]any)
			if !ok {
				continue
			}
			if thought, _ := part["thought"].(bool); thought {
				continue
			}
			appendStringRef(packet, &packet.primary, part, "text")
		}
	}
}

func extractResponsesInterceptionText(packet *interceptionPacket, root map[string]any) {
	eventType, _ := root["type"].(string)
	if eventType == "response.output_text.delta" {
		appendStringRef(packet, &packet.primary, root, "delta")
		return
	}
	if eventType == "" {
		extractResponsesOutputRefs(packet, &packet.primary, root["output"])
		return
	}
	if response, ok := root["response"].(map[string]any); ok {
		extractResponsesOutputRefs(packet, &packet.mirrors, response["output"])
	}
	if item, ok := root["item"].(map[string]any); ok {
		extractResponsesOutputRefs(packet, &packet.mirrors, []any{item})
	}
}

func extractResponsesOutputRefs(packet *interceptionPacket, target *[]*interceptionTextRef, raw any) {
	outputs, _ := raw.([]any)
	for _, output := range outputs {
		item, ok := output.(map[string]any)
		if !ok {
			continue
		}
		content, _ := item["content"].([]any)
		for _, rawPart := range content {
			part, ok := rawPart.(map[string]any)
			if !ok {
				continue
			}
			if partType, _ := part["type"].(string); partType == "output_text" || partType == "text" || partType == "" {
				appendStringRef(packet, target, part, "text")
			}
		}
	}
}
