package common

import (
	"encoding/base64"
	"encoding/json"
	"mime"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"unicode/utf8"
)

const (
	requestDebugHeaderLimit      = 64
	requestDebugHeaderValueLimit = 512
	// Each section is bounded so the combined inbound/upstream/response debug
	// object remains comfortably below the log field's diagnostic JSON budget.
	requestDebugJSONLimit = 4 * 1024
	requestDebugURLLimit  = 2048
	RequestDebugBodyLimit = 32 * 1024
)

// RequestDebugInbound returns safe request metadata. It deliberately never reads
// the body: diagnostics must not retain request payloads.
func RequestDebugInbound(req *http.Request) map[string]interface{} {
	if req == nil {
		return nil
	}
	result := map[string]interface{}{
		"method":           truncateDebugString(req.Method, 64),
		"url":              requestDebugURL(req.URL),
		"host":             truncateDebugString(requestHost(req), 512),
		"remote_addr":      truncateDebugString(req.RemoteAddr, 512),
		"headers":          requestDebugHeaders(req.Header),
		"body_bytes":       maxInt64(req.ContentLength, 0),
		"body_bytes_known": req.ContentLength >= 0,
	}
	return limitDebugJSON(result)
}

// RequestDebugUpstream returns safe outbound metadata without consuming req.Body.
func RequestDebugUpstream(req *http.Request) map[string]interface{} {
	if req == nil {
		return nil
	}
	result := map[string]interface{}{
		"method":           truncateDebugString(req.Method, 64),
		"url":              requestDebugURL(req.URL),
		"host":             truncateDebugString(requestHost(req), 512),
		"headers":          requestDebugHeaders(req.Header),
		"body_bytes":       maxInt64(req.ContentLength, 0),
		"body_bytes_known": req.ContentLength >= 0,
	}
	return limitDebugJSON(result)
}

// RequestDebugResponse returns safe response metadata without reading resp.Body.
func RequestDebugResponse(resp *http.Response) map[string]interface{} {
	if resp == nil {
		return nil
	}
	result := map[string]interface{}{
		"status":           resp.StatusCode,
		"protocol":         truncateDebugString(resp.Proto, 64),
		"headers":          requestDebugHeaders(resp.Header),
		"body_bytes":       maxInt64(resp.ContentLength, 0),
		"body_bytes_known": resp.ContentLength >= 0,
	}
	return limitDebugJSON(result)
}

func requestDebugURL(u *url.URL) string {
	if IsRequestDebugRawEnabled() {
		if u == nil {
			return ""
		}
		copyURL := *u
		copyURL.Fragment = ""
		return truncateDebugString(copyURL.String(), requestDebugURLLimit)
	}
	return sanitizeDebugURL(u)
}

func requestDebugHeaders(headers http.Header) map[string]interface{} {
	return sanitizeDebugHeadersWithRaw(headers, IsRequestDebugRawEnabled())
}

func sanitizeDebugURL(u *url.URL) string {
	if u == nil {
		return ""
	}
	copyURL := *u
	copyURL.User = nil
	query := copyURL.Query()
	for key := range query {
		if isSensitiveDebugName(key) {
			query[key] = []string{"[REDACTED]"}
		}
	}
	copyURL.RawQuery = query.Encode()
	copyURL.Fragment = ""
	return truncateDebugString(copyURL.String(), requestDebugURLLimit)
}

func requestHost(req *http.Request) string {
	if req == nil {
		return ""
	}
	if req.Host != "" {
		return req.Host
	}
	if req.URL != nil {
		return req.URL.Host
	}
	return ""
}

func sanitizeDebugHeaders(headers http.Header) map[string]interface{} {
	return sanitizeDebugHeadersWithRaw(headers, false)
}

func sanitizeDebugHeadersWithRaw(headers http.Header, raw bool) map[string]interface{} {
	result := make(map[string]interface{})
	names := make([]string, 0, len(headers))
	for name := range headers {
		names = append(names, name)
	}
	sort.Strings(names)
	truncated := false
	for i, name := range names {
		if i >= requestDebugHeaderLimit {
			truncated = true
			break
		}
		if !raw && isSensitiveDebugName(name) {
			result[name] = "[REDACTED]"
			continue
		}
		values := headers.Values(name)
		if len(values) <= 1 {
			if len(values) == 1 {
				result[name] = truncateDebugString(values[0], requestDebugHeaderValueLimit)
			} else {
				result[name] = ""
			}
			continue
		}
		limited := make([]string, 0, len(values))
		for _, value := range values {
			limited = append(limited, truncateDebugString(value, requestDebugHeaderValueLimit))
		}
		result[name] = limited
	}
	if truncated {
		result["truncated"] = true
	}
	return result
}

// RequestDebugBody returns a JSON-safe representation of a captured request
// body. Callers must only invoke it after the root-only raw option is enabled.
// Text and JSON remain readable; other data is base64 encoded.
func RequestDebugBody(data []byte, contentType string, truncated bool) map[string]interface{} {
	if len(data) > RequestDebugBodyLimit {
		data = data[:RequestDebugBodyLimit]
		truncated = true
	}
	return RequestDebugBodyRepresentation(data, contentType, truncated)
}

// RequestDebugBodyRepresentation formats an already bounded body without
// applying the preview limit. Full bodies are only returned by the root-only
// on-demand diagnostics endpoint.
func RequestDebugBodyRepresentation(data []byte, contentType string, truncated bool) map[string]interface{} {
	if truncated && isTextualRequestDebugContentType(contentType) {
		data = trimIncompleteUTF8Tail(data)
	}
	result := map[string]interface{}{"body_truncated": truncated}
	if isDisplayableRequestDebugBody(data, contentType) {
		result["body"] = string(data)
	} else {
		result["body"] = base64.StdEncoding.EncodeToString(data)
		result["body_encoding"] = "base64"
	}
	return result
}

func trimIncompleteUTF8Tail(data []byte) []byte {
	if utf8.Valid(data) || len(data) == 0 {
		return data
	}

	for trim := 1; trim < utf8.UTFMax && trim <= len(data); trim++ {
		prefixEnd := len(data) - trim
		if !utf8.Valid(data[:prefixEnd]) || !isUTF8RunePrefix(data[prefixEnd:]) {
			continue
		}
		return data[:prefixEnd]
	}
	return data
}

func isUTF8RunePrefix(data []byte) bool {
	if len(data) == 0 || len(data) >= utf8.UTFMax {
		return false
	}
	width := utf8PartialWidth(data[0])
	if width <= 1 || len(data) >= width {
		return false
	}
	for _, b := range data[1:] {
		if b&0xc0 != 0x80 {
			return false
		}
	}

	completed := make([]byte, width)
	copy(completed, data)
	for i := len(data); i < width; i++ {
		completed[i] = 0x80
	}
	if len(data) == 1 {
		switch completed[0] {
		case 0xe0:
			completed[1] = 0xa0
		case 0xf0:
			completed[1] = 0x90
		}
	}
	return utf8.Valid(completed)
}

func utf8PartialWidth(first byte) int {
	switch {
	case first >= 0xc2 && first <= 0xdf:
		return 2
	case first >= 0xe0 && first <= 0xef:
		return 3
	case first >= 0xf0 && first <= 0xf4:
		return 4
	default:
		return 1
	}
}

func isTextualRequestDebugContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	return err == nil && (strings.Contains(mediaType, "json") || strings.HasPrefix(mediaType, "text/") || mediaType == "application/x-www-form-urlencoded")
}

func isDisplayableRequestDebugBody(data []byte, contentType string) bool {
	if !utf8.Valid(data) {
		return false
	}
	if isTextualRequestDebugContentType(contentType) {
		return true
	}
	for _, r := range string(data) {
		if r < 0x20 && r != '\n' && r != '\r' && r != '\t' {
			return false
		}
	}
	return true
}

func isSensitiveDebugName(name string) bool {
	name = strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(strings.TrimSpace(name), "_", "-"), " ", ""))
	if name == "key" {
		return true
	}
	for _, sensitive := range []string{"authorization", "cookie", "api-key", "apikey", "token", "secret", "password", "credential", "signature"} {
		if strings.Contains(name, sensitive) {
			return true
		}
	}
	return false
}

func limitDebugJSON(result map[string]interface{}) map[string]interface{} {
	encoded, err := json.Marshal(result)
	if err == nil && len(encoded) <= requestDebugJSONLimit {
		return result
	}
	// Headers are the only unbounded structured input after string truncation.
	// Remove them rather than emitting invalid or oversized JSON.
	result["headers"] = map[string]interface{}{"truncated": true}
	result["truncated"] = true
	return result
}

func truncateDebugString(value string, limit int) string {
	if len(value) <= limit {
		return value
	}
	limit -= len("…")
	for limit > 0 && !utf8.RuneStart(value[limit]) {
		limit--
	}
	return value[:limit] + "…"
}

func maxInt64(value, minimum int64) int64 {
	if value < minimum {
		return minimum
	}
	return value
}
