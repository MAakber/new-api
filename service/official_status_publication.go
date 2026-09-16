package service

import (
	"bytes"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"golang.org/x/net/html"
)

func officialEventEnd(status, raw string) (*time.Time, error) {
	switch strings.ToLower(status) {
	case "resolved", "completed", "postmortem":
		if raw == "" {
			return nil, fmt.Errorf("%w: resolution timestamp missing", errOfficialFormat)
		}
	case "investigating", "identified", "monitoring", "in_progress", "verifying", "scheduled", "ongoing":
	default:
		return nil, fmt.Errorf("%w: unknown incident state %q", errOfficialFormat, status)
	}
	if raw == "" {
		return nil, nil
	}
	end, err := officialTime(raw)
	if err != nil {
		return nil, err
	}
	return &end, nil
}

// Flight frames contain JSON data as well as imports and text. Only valid
// JSON frames are decoded. In HTML, only the JSON argument to a known Flight
// push is read; scripts are never evaluated or run in a browser.
func officialFlightData(body []byte, isHTML bool) ([]any, error) {
	data := string(body)
	if isHTML {
		var flight strings.Builder
		tokens := html.NewTokenizer(bytes.NewReader(body))
		for {
			kind := tokens.Next()
			if kind == html.ErrorToken {
				if tokens.Err() != io.EOF {
					return nil, tokens.Err()
				}
				break
			}
			if kind != html.TextToken {
				continue
			}
			text := strings.TrimSpace(string(tokens.Text()))
			argument, ok := strings.CutPrefix(text, "self.__next_f.push(")
			if !ok {
				continue
			}
			argument = strings.TrimSuffix(argument, ";")
			argument, ok = strings.CutSuffix(argument, ")")
			if !ok {
				continue
			}
			var frame []any
			if common.UnmarshalJsonStr(argument, &frame) != nil || len(frame) != 2 {
				continue
			}
			if content, ok := frame[1].(string); ok {
				flight.WriteString(content)
			}
		}
		data = flight.String()
	}
	var values []any
	for line := range strings.SplitSeq(data, "\n") {
		_, payload, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		var value any
		if common.UnmarshalJsonStr(payload, &value) == nil {
			values = append(values, value)
		}
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("%w: no structured publication data", errOfficialFormat)
	}
	return values, nil
}

func officialWalkData(value any, depth int, visit func(map[string]any)) {
	if depth > 80 {
		return
	}
	switch item := value.(type) {
	case map[string]any:
		visit(item)
		for _, child := range item {
			officialWalkData(child, depth+1, visit)
		}
	case []any:
		for _, child := range item {
			officialWalkData(child, depth+1, visit)
		}
	}
}

func officialPlainHTML(value string) string {
	var text strings.Builder
	tokens := html.NewTokenizer(strings.NewReader(value))
	for {
		kind := tokens.Next()
		if kind == html.ErrorToken {
			break
		}
		if kind == html.TextToken {
			text.Write(tokens.Text())
			text.WriteByte('\n')
		}
	}
	return strings.TrimSpace(text.String())
}

func officialPublicationURL(candidate, base string) string {
	root, err := url.Parse(base)
	if err != nil {
		return base
	}
	parsed, err := url.Parse(candidate)
	if err != nil {
		return base
	}
	parsed = root.ResolveReference(parsed)
	if parsed.Scheme != "https" || parsed.Host != root.Host || parsed.User != nil {
		return base
	}
	return parsed.String()
}
