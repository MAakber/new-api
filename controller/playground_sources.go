package controller

import (
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"regexp"
	"slices"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type playgroundWebSearchSource struct {
	ID          string `json:"id,omitempty"`
	Href        string `json:"href"`
	Title       string `json:"title"`
	ToolCallID  string `json:"tool_call_id,omitempty"`
	PublishedAt string `json:"published_at,omitempty"`
	Cited       bool   `json:"cited"`
}

var playgroundSourceURL = regexp.MustCompile(`https?://[^\s<>"\x60\x5d\x29]+`)

func collectPlaygroundSources(text, callID string) []playgroundWebSearchSource {
	sources := make([]playgroundWebSearchSource, 0)
	var value any
	if common.UnmarshalJsonStr(text, &value) == nil {
		walkPlaygroundSources(value, callID, &sources, 0)
	}
	// Plain-text MCP tools commonly return markdown instead of structured JSON.
	for _, href := range playgroundSourceURL.FindAllString(text, 128) {
		sources = mergePlaygroundSources(sources, []playgroundWebSearchSource{{Href: strings.TrimRight(href, ".,;"), ToolCallID: callID}})
	}
	return sources
}

func walkPlaygroundSources(value any, callID string, sources *[]playgroundWebSearchSource, depth int) {
	if depth > 12 || len(*sources) >= 128 {
		return
	}
	switch current := value.(type) {
	case []any:
		for _, child := range current {
			walkPlaygroundSources(child, callID, sources, depth+1)
		}
	case map[string]any:
		href, _ := current["url"].(string)
		if href == "" {
			href, _ = current["href"].(string)
		}
		if href == "" {
			href, _ = current["uri"].(string)
		}
		title, _ := current["title"].(string)
		published, _ := current["published_date"].(string)
		if published == "" {
			published, _ = current["published_at"].(string)
		}
		if href != "" {
			*sources = mergePlaygroundSources(*sources, []playgroundWebSearchSource{{Href: href, Title: title, ToolCallID: callID, PublishedAt: published}})
		}
		for _, child := range current {
			walkPlaygroundSources(child, callID, sources, depth+1)
		}
	}
}

func mergePlaygroundSources(current, incoming []playgroundWebSearchSource) []playgroundWebSearchSource {
	for _, source := range incoming {
		parsed, err := url.Parse(strings.TrimSpace(source.Href))
		if err != nil || parsed.Host == "" || parsed.User != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			continue
		}
		source.Href = parsed.String()
		if len(source.Href) > 4096 {
			continue
		}
		index := slices.IndexFunc(current, func(existing playgroundWebSearchSource) bool { return existing.Href == source.Href })
		if index >= 0 {
			current[index].Cited = current[index].Cited || source.Cited
			if current[index].Title == "" {
				current[index].Title = source.Title
			}
			continue
		}
		if source.Title == "" {
			source.Title = parsed.Hostname()
		}
		if len(source.Title) > 512 {
			source.Title = parsed.Hostname()
		}
		// Keep later results. Display limits are applied after citations are known.
		if len(current) >= 1024 && !source.Cited {
			continue
		}
		digest := sha256.Sum256([]byte(source.Href))
		source.ID = "source-" + hex.EncodeToString(digest[:8])
		current = append(current, source)
	}
	return current
}

func citedPlaygroundSources(sources []playgroundWebSearchSource, answer string) []playgroundWebSearchSource {
	answerSources := collectPlaygroundSources(answer, "")
	citedURLs := make(map[string]bool, len(answerSources))
	for _, source := range answerSources {
		citedURLs[source.Href] = true
	}
	// Answer links establish citations only when they match retrieved sources.
	for index := range sources {
		sources[index].Cited = sources[index].Cited || citedURLs[sources[index].Href]
	}
	slices.SortStableFunc(sources, func(a, b playgroundWebSearchSource) int {
		if a.Cited == b.Cited {
			return 0
		}
		if a.Cited {
			return -1
		}
		return 1
	})
	// All cited sources survive; only unreferenced candidates are capped.
	count, candidates := 0, 0
	for _, source := range sources {
		if source.Cited || candidates < 32 {
			count++
			if !source.Cited {
				candidates++
			}
		}
	}
	return sources[:count]
}
