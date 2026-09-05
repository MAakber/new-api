package bingsearch

import (
	"context"
	"encoding/base64"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func bingResponse(statusCode int, body string) *http.Response {
	return &http.Response{
		StatusCode: statusCode,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     make(http.Header),
	}
}

func TestClientSearchBuildsBingRequestWithBrowserHeaders(t *testing.T) {
	var received *http.Request
	httpClient := &http.Client{
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			received = request
			_, hasDeadline := request.Context().Deadline()
			assert.True(t, hasDeadline)
			return bingResponse(http.StatusOK, `<li class="b_algo"><h2><a href="https://example.com">Example</a></h2></li>`), nil
		}),
	}
	client := NewClientWithHTTPClient(httpClient)

	results, err := client.SearchWithLanguage(context.Background(), "sensitive query", "zh-CN,zh;q=0.9")

	require.NoError(t, err)
	require.Len(t, results, 1)
	require.NotNil(t, received)
	parsedURL, err := url.Parse(received.URL.String())
	require.NoError(t, err)
	assert.Equal(t, SearchEndpoint, parsedURL.Scheme+"://"+parsedURL.Host+parsedURL.Path)
	assert.Equal(t, "sensitive query", parsedURL.Query().Get("q"))
	assert.Equal(t, "8", parsedURL.Query().Get("count"))
	assert.Equal(t, "zh-CN", parsedURL.Query().Get("setlang"))
	assert.Equal(t, DefaultUserAgent, received.Header.Get("User-Agent"))
	assert.Contains(t, received.Header.Get("Accept"), "text/html")
	assert.Equal(t, "zh-CN,zh;q=0.9", received.Header.Get("Accept-Language"))
}

func TestTruncateQueryForURLRespectsEncodedLimit(t *testing.T) {
	query := strings.Repeat("网页搜索 ", 600)
	truncated := truncateQueryForURL(query)

	require.NotEmpty(t, truncated)
	assert.LessOrEqual(t, len(url.QueryEscape(truncated)), maxEncodedQueryBytes)
	assert.Less(t, len([]rune(truncated)), len([]rune(query)))
}

func TestClientSearchTimeoutAndResponseLimit(t *testing.T) {
	timeoutClient := NewClientWithTimeout(&http.Client{
		Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
			<-request.Context().Done()
			return nil, request.Context().Err()
		}),
	}, 10*time.Millisecond)
	_, err := timeoutClient.Search(context.Background(), "secret query")
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrTimeout)

	largeClient := NewClientWithHTTPClient(&http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return bingResponse(http.StatusOK, strings.Repeat("x", MaxResponseBytes+1)), nil
		}),
	})
	_, err = largeClient.Search(context.Background(), "secret query")
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrResponseTooLarge)
}

func TestClientSearchRejectsHTTPErrorWithoutReturningResponseBody(t *testing.T) {
	secretBody := "private response body"
	client := NewClientWithHTTPClient(&http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return bingResponse(http.StatusServiceUnavailable, secretBody), nil
		}),
	})

	_, err := client.Search(context.Background(), "private query")

	require.Error(t, err)
	assert.Contains(t, err.Error(), "503")
	assert.NotContains(t, err.Error(), secretBody)
}

func TestParseHTMLExtractsNestedResultsAndUnwrapsBingRedirects(t *testing.T) {
	encodedURL := base64.RawURLEncoding.EncodeToString([]byte("https://redirect.example/article"))
	body := `<html><body>
<li class="b_algo first"><h2><span><a href="https://example.com/article"><span>First result</span></a></span></h2><div class="b_caption"><div><p>First <strong>summary</strong>.</p></div></div></li>
<li class="b_algo"><h2><a href="https://example.com/article">Duplicate</a></h2><div class="b_caption"><p>Duplicate summary</p></div></li>
<li class="b_algo"><h2><a href="javascript:alert(1)">Unsafe</a></h2><div class="b_caption"><p>Ignore this</p></div></li>
<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1` + encodedURL + `">Redirected result</a></h2><div class="b_caption"><p>Redirect summary</p></div></li>
</body></html>`

	results, err := ParseHTML([]byte(body))

	require.NoError(t, err)
	require.Len(t, results, 2)
	assert.Equal(t, "First result", results[0].Title)
	assert.Equal(t, "https://example.com/article", results[0].URL)
	assert.Equal(t, "First summary.", results[0].Snippet)
	assert.Equal(t, "https://redirect.example/article", results[1].URL)
	assert.Equal(t, "Redirected result", results[1].Title)
}

func TestParseHTMLRejectsChallengesAndNoResults(t *testing.T) {
	_, err := ParseHTML([]byte(`<html><title>Verify you are human</title><body>captcha</body></html>`))
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrChallengePage)

	_, err = ParseHTML([]byte(`<html><body><p>Nothing here</p></body></html>`))
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNoResults)

	_, err = ParseHTML([]byte(`<li class="b_algo"><h2><a href="data:text/html,bad">Bad</a></h2></li>`))
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNoResults)

	_, err = ParseHTML([]byte(`<li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=javascript%3Aalert(1)">Unsafe redirect</a></h2></li>`))
	require.Error(t, err)
	assert.ErrorIs(t, err, ErrNoResults)
}

func TestParseHTMLLimitsResultsAndDoesNotReturnTransportErrorDetails(t *testing.T) {
	var builder strings.Builder
	for index := 0; index < MaxResults+3; index++ {
		builder.WriteString(`<li class="b_algo"><h2><a href="https://example.com/`)
		builder.WriteString(string(rune('a' + index)))
		builder.WriteString(`">Result</a></h2></li>`)
	}
	results, err := ParseHTML([]byte(builder.String()))
	require.NoError(t, err)
	assert.Len(t, results, MaxResults)

	secret := "private search phrase"
	client := NewClientWithHTTPClient(&http.Client{
		Transport: roundTripFunc(func(_ *http.Request) (*http.Response, error) {
			return nil, errors.New("transport failed")
		}),
	})
	_, err = client.Search(context.Background(), secret)
	require.Error(t, err)
	assert.NotContains(t, err.Error(), secret)
}
