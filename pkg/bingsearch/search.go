// Package bingsearch provides a small, server-side Bing HTML search client.
package bingsearch

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const (
	SearchEndpoint        = "https://www.bing.com/search"
	DefaultTimeout        = 10 * time.Second
	DefaultAcceptLanguage = "en-US,en;q=0.9"
	DefaultUserAgent      = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
	MaxResponseBytes      = 2 << 20
	MaxResults            = 8
	maxEncodedQueryBytes  = 1_500
)

var (
	ErrChallengePage    = errors.New("bing search challenge page")
	ErrNoResults        = errors.New("bing search returned no results")
	ErrResponseTooLarge = errors.New("bing search response too large")
	ErrTimeout          = errors.New("bing search timed out")
)

// Result is one result parsed from a Bing result page.
type Result struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Snippet string `json:"snippet,omitempty"`
}

// Client performs a Bing search. HTTPClient is injectable for deterministic
// tests; the production endpoint remains the fixed Bing endpoint above.
type Client struct {
	HTTPClient *http.Client
	Timeout    time.Duration
}

// NewClient creates a Bing client. An optional HTTP client is accepted to make
// transport-level behavior testable without changing the public endpoint.
func NewClient(httpClients ...*http.Client) *Client {
	var httpClient *http.Client
	if len(httpClients) > 0 {
		httpClient = httpClients[0]
	}
	if httpClient == nil {
		httpClient = &http.Client{
			Timeout:       DefaultTimeout,
			CheckRedirect: checkBingRedirect,
		}
	}
	return &Client{HTTPClient: httpClient, Timeout: DefaultTimeout}
}

// NewClientWithHTTPClient is an explicit constructor for an injected client.
func NewClientWithHTTPClient(httpClient *http.Client) *Client {
	return NewClient(httpClient)
}

// NewClientWithTimeout creates a client with a caller-provided timeout. A
// non-positive timeout falls back to the production default.
func NewClientWithTimeout(httpClient *http.Client, timeout time.Duration) *Client {
	client := NewClient(httpClient)
	if timeout > 0 {
		client.Timeout = timeout
	}
	return client
}

// Search searches Bing using the default browser language.
func (c *Client) Search(ctx context.Context, query string) ([]Result, error) {
	return c.SearchWithLanguage(ctx, query, DefaultAcceptLanguage)
}

// SearchWithLanguage searches Bing and uses acceptLanguage both for the
// browser request header and for Bing's setlang query parameter.
func (c *Client) SearchWithLanguage(ctx context.Context, query, acceptLanguage string) ([]Result, error) {
	if strings.TrimSpace(query) == "" {
		return nil, errors.New("bing search query is empty")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	timeout := DefaultTimeout
	httpClient := (*http.Client)(nil)
	if c != nil {
		if c.Timeout > 0 {
			timeout = c.Timeout
		}
		httpClient = c.HTTPClient
	}
	if httpClient == nil {
		httpClient = &http.Client{Timeout: timeout}
	}

	requestContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	languageHeader := safeAcceptLanguage(acceptLanguage)
	languageTag := languageTag(languageHeader)
	queryValues := url.Values{}
	queryValues.Set("q", truncateQueryForURL(query))
	queryValues.Set("count", fmt.Sprintf("%d", MaxResults))
	queryValues.Set("setlang", languageTag)

	searchURL, err := url.Parse(SearchEndpoint)
	if err != nil {
		return nil, errors.New("bing search request construction failed")
	}
	searchURL.RawQuery = queryValues.Encode()
	request, err := http.NewRequestWithContext(requestContext, http.MethodGet, searchURL.String(), nil)
	if err != nil {
		return nil, errors.New("bing search request construction failed")
	}
	request.Header.Set("User-Agent", DefaultUserAgent)
	request.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	request.Header.Set("Accept-Language", languageHeader)

	response, err := httpClient.Do(request)
	if err != nil {
		if errors.Is(requestContext.Err(), context.DeadlineExceeded) || errors.Is(err, context.DeadlineExceeded) {
			return nil, ErrTimeout
		}
		return nil, errors.New("bing search request failed")
	}
	if response == nil {
		return nil, errors.New("bing search returned an empty response")
	}
	if response.Body != nil {
		defer response.Body.Close()
	}

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("bing search returned HTTP %d", response.StatusCode)
	}
	if response.Body == nil {
		return nil, errors.New("bing search returned an empty response")
	}

	body, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil {
		return nil, errors.New("bing search response could not be read")
	}
	if len(body) > MaxResponseBytes {
		return nil, ErrResponseTooLarge
	}

	return ParseHTML(body)
}

func truncateQueryForURL(query string) string {
	query = strings.TrimSpace(query)
	if len(query) <= maxEncodedQueryBytes {
		return query
	}

	runes := []rune(query)
	low, high := 0, len(runes)
	for low < high {
		middle := low + (high-low+1)/2
		if len(url.QueryEscape(string(runes[:middle]))) <= maxEncodedQueryBytes {
			low = middle
			continue
		}
		high = middle - 1
	}
	return string(runes[:low])
}

// ParseHTML parses Bing's result list. It deliberately reads only result
// elements and never interprets script contents.
func ParseHTML(body []byte) ([]Result, error) {
	if looksLikeChallenge(body) {
		return nil, ErrChallengePage
	}

	document, err := html.Parse(bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("bing search HTML could not be parsed")
	}

	results := make([]Result, 0, MaxResults)
	var visit func(*html.Node)
	visit = func(node *html.Node) {
		if node == nil || len(results) >= MaxResults {
			return
		}
		if isElement(node, "li") && hasClass(node, "b_algo") {
			if result, ok := parseResult(node); ok {
				if !hasResultURL(results, result.URL) {
					results = append(results, result)
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			visit(child)
			if len(results) >= MaxResults {
				return
			}
		}
	}
	visit(document)

	if len(results) == 0 {
		return nil, ErrNoResults
	}
	return results, nil
}

// ParseResults is an alias with a result-oriented name for callers that do
// not need to know the input format.
func ParseResults(body []byte) ([]Result, error) {
	return ParseHTML(body)
}

func parseResult(node *html.Node) (Result, bool) {
	heading := findDescendant(node, func(candidate *html.Node) bool {
		return isElement(candidate, "h2")
	})
	if heading == nil {
		return Result{}, false
	}
	anchor := findDescendant(heading, func(candidate *html.Node) bool {
		return isElement(candidate, "a")
	})
	if anchor == nil {
		return Result{}, false
	}

	href, ok := normalizeURL(attribute(anchor, "href"))
	if !ok {
		return Result{}, false
	}
	title := normalizeText(textContent(heading))
	if title == "" {
		title = normalizeText(textContent(anchor))
	}
	if title == "" {
		if parsed, err := url.Parse(href); err == nil {
			title = parsed.Hostname()
		}
	}

	snippet := ""
	caption := findDescendant(node, func(candidate *html.Node) bool {
		return hasClass(candidate, "b_caption")
	})
	if caption != nil {
		paragraph := findDescendant(caption, func(candidate *html.Node) bool {
			return isElement(candidate, "p")
		})
		if paragraph != nil {
			snippet = normalizeText(textContent(paragraph))
		}
	}

	return Result{Title: title, URL: href, Snippet: snippet}, true
}

func findDescendant(node *html.Node, predicate func(*html.Node) bool) *html.Node {
	if node == nil {
		return nil
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if predicate(child) {
			return child
		}
		if found := findDescendant(child, predicate); found != nil {
			return found
		}
	}
	return nil
}

func textContent(node *html.Node) string {
	if node == nil || isElement(node, "script") || isElement(node, "style") || isElement(node, "noscript") {
		return ""
	}
	if node.Type == html.TextNode {
		return node.Data
	}
	var builder strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		builder.WriteString(textContent(child))
	}
	return builder.String()
}

func normalizeText(value string) string {
	return strings.Join(strings.Fields(value), " ")
}

func isElement(node *html.Node, name string) bool {
	return node != nil && node.Type == html.ElementNode && strings.EqualFold(node.Data, name)
}

func hasClass(node *html.Node, className string) bool {
	if node == nil || node.Type != html.ElementNode {
		return false
	}
	for _, class := range strings.Fields(attribute(node, "class")) {
		if class == className {
			return true
		}
	}
	return false
}

func attribute(node *html.Node, name string) string {
	if node == nil {
		return ""
	}
	for _, attr := range node.Attr {
		if strings.EqualFold(attr.Key, name) {
			return attr.Val
		}
	}
	return ""
}

func hasResultURL(results []Result, href string) bool {
	for _, result := range results {
		if result.URL == href {
			return true
		}
	}
	return false
}

func normalizeURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", false
	}

	for attempt := 0; attempt < 3; attempt++ {
		parsed, err := url.Parse(raw)
		if err != nil || parsed.Host == "" {
			return "", false
		}
		scheme := strings.ToLower(parsed.Scheme)
		if scheme != "http" && scheme != "https" {
			return "", false
		}

		if isBingHost(parsed.Hostname()) {
			redirect := parsed.Query().Get("u")
			if redirect == "" {
				redirect = parsed.Query().Get("url")
			}
			if redirect != "" {
				decoded := decodeRedirectURL(redirect)
				if decoded == "" || decoded == raw {
					return "", false
				}
				raw = decoded
				continue
			}
		}

		parsed.Scheme = scheme
		parsed.Host = strings.ToLower(parsed.Host)
		parsed.Fragment = ""
		return parsed.String(), true
	}
	return "", false
}

func decodeRedirectURL(value string) string {
	if value == "" {
		return ""
	}
	values := []string{value}
	if decoded, err := url.QueryUnescape(value); err == nil && decoded != value {
		values = append(values, decoded)
	}
	encodings := []*base64.Encoding{
		base64.RawURLEncoding,
		base64.URLEncoding,
		base64.RawStdEncoding,
		base64.StdEncoding,
	}
	for _, value := range values {
		if strings.HasPrefix(strings.ToLower(value), "http://") || strings.HasPrefix(strings.ToLower(value), "https://") {
			return value
		}
		candidates := []string{value}
		if strings.HasPrefix(value, "a1") {
			candidates = append(candidates, value[2:])
		}
		for _, candidate := range candidates {
			for _, encoding := range encodings {
				decoded, err := encoding.DecodeString(candidate)
				if err != nil {
					continue
				}
				result := strings.TrimSpace(string(decoded))
				if strings.HasPrefix(strings.ToLower(result), "http://") || strings.HasPrefix(strings.ToLower(result), "https://") {
					return result
				}
			}
		}
	}
	return ""
}

func isBingHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(host, "."))
	return host == "bing.com" || strings.HasSuffix(host, ".bing.com")
}

func checkBingRedirect(request *http.Request, via []*http.Request) error {
	if len(via) >= 3 || request == nil || request.URL == nil || !isBingHost(request.URL.Hostname()) {
		return http.ErrUseLastResponse
	}
	return nil
}

func looksLikeChallenge(body []byte) bool {
	lower := strings.ToLower(string(body))
	markers := []string{
		"b_captcha",
		"g-recaptcha",
		"cf-chl-",
		"id=\"challenge\"",
		"challenge-form",
		"verify you are human",
		"please verify you are human",
		"unusual traffic",
		"are you a robot",
		"automated queries",
		"just a moment",
		"access denied",
		"security check",
		"robot check",
	}
	for _, marker := range markers {
		if strings.Contains(lower, marker) {
			return true
		}
	}
	return false
}

func safeAcceptLanguage(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.ContainsAny(value, "\r\n") {
		return DefaultAcceptLanguage
	}
	return value
}

func languageTag(value string) string {
	value = strings.TrimSpace(strings.Split(value, ",")[0])
	value = strings.TrimSpace(strings.Split(value, ";")[0])
	if value == "" {
		return "en-US"
	}
	for _, char := range value {
		if (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z') || char == '-' {
			continue
		}
		return "en-US"
	}
	return value
}
