package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type officialRoundTripFunc func(*http.Request) (*http.Response, error)

func (f officialRoundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func officialFixtureClient(t *testing.T) (*http.Client, map[string][]byte, *atomic.Int64) {
	t.Helper()
	names := map[string]string{
		"https://www.google.com/appsstatus/dashboard/incidents.json": "google.json",
		"https://status.openrouter.ai/config.json":                   "openrouter.json",
		"https://status.together.ai/index.json":                      "together.json",
		"https://status.openai.com/api/v2/components.json":           "openai-components.json",
		"https://status.openai.com/api/v2/incidents.json":            "openai-incidents.json",
		"https://status.openai.com/":                                 "openai-page.html",
		"https://status.claude.com/api/v2/components.json":           "claude-summary.json",
		"https://status.claude.com/api/v2/summary.json":              "claude-summary.json",
		"https://status.claude.com/api/v2/incidents.json":            "claude-incidents.json",
		"https://status.x.ai/feed.xml":                               "xai-feed.xml",
		officialDeepSeekAPI + "/summary/active":                      "deepseek-active.json",
		officialDeepSeekAPI + "/summary/structure":                   "deepseek-structure.json",
		officialDeepSeekAPI + "/change/list":                         "deepseek-changes.json",
	}
	for _, slug := range []string{"grok-com", "ios-app", "android-app", "api-us-east-1", "api-us-west-2", "api-eu-west-1"} {
		names["https://status.x.ai/"+slug+".txt"] = slug + ".txt"
	}
	bodies := map[string][]byte{}
	for url, name := range names {
		body, err := os.ReadFile(filepath.Join("testdata", "official-status", name))
		require.NoError(t, err)
		bodies[url] = body
	}
	calls := &atomic.Int64{}
	client := &http.Client{Transport: officialRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls.Add(1)
		key := r.URL.Scheme + "://" + r.URL.Host + r.URL.Path
		body, found := bodies[key]
		if !found {
			return nil, fmt.Errorf("sample source unavailable: %s", key)
		}
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(string(body))), Header: http.Header{}, Request: r}, nil
	})}
	return client, bodies, calls
}

func TestOfficialPublishedSamplesAndCachedWindows(t *testing.T) {
	client, _, calls := officialFixtureClient(t)
	aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
	now := time.Date(2026, 9, 16, 4, 30, 0, 0, time.UTC)
	aggregator.now = func() time.Time { return now }
	snapshot, err := aggregator.snapshot(context.Background(), 90, officialSources[:4])
	require.NoError(t, err)
	require.Len(t, snapshot.Providers, 4)
	for _, provider := range snapshot.Providers {
		t.Run(provider.ID, func(t *testing.T) {
			require.Equal(t, "live", provider.Sync.State)
			assert.True(t, slices.ContainsFunc(provider.Services, func(s OfficialService) bool { return s.Kind == "api" && len(s.Components) > 0 }))
			assert.True(t, slices.ContainsFunc(provider.Services, func(s OfficialService) bool { return s.Kind == "chat" && len(s.Components) > 0 }))
			assert.Len(t, provider.History, 90)
			assert.True(t, slices.ContainsFunc(provider.Incidents, func(e OfficialIncident) bool { return e.EndAt != nil && len(e.Impacts) > 0 }))
			assert.True(t, slices.ContainsFunc(provider.History, func(d OfficialDay) bool { return d.Status != OfficialUnknown && d.Status != OfficialOperational }))
		})
	}
	openai := snapshot.Providers[0]
	assert.Equal(t, "APIs", openai.Services[0].Name)
	assert.True(t, slices.ContainsFunc(openai.Services[0].Components, func(c OfficialComponent) bool { return c.ID == "01JSM5RTJWHRWDTS6Q604VEW3B" && c.Name == "Login" }))
	assert.True(t, slices.ContainsFunc(openai.Services[1].Components, func(c OfficialComponent) bool { return c.ID == "01JMXBNJXG1S2D9V65P1ZZTD94" && c.Name == "Login" }))
	// These publishers repeated page 1 on page 2 during sample capture.
	assert.Equal(t, "limited_history", openai.Services[0].Coverage.Reason)
	assert.Equal(t, OfficialUnknown, openai.History[0].Status)
	assert.False(t, openai.History[0].Complete)
	assert.Len(t, openai.Incidents, 3)
	deepseek := snapshot.Providers[3]
	assert.True(t, slices.ContainsFunc(deepseek.Services[0].Components, func(c OfficialComponent) bool { return len(c.Availability) == 2 }))
	assert.True(t, slices.ContainsFunc(deepseek.Incidents, func(e OfficialIncident) bool { return slices.Contains(e.ServiceIDs, "chat") }))
	before := calls.Load()
	short, err := aggregator.snapshot(context.Background(), 30, officialSources[:4])
	require.NoError(t, err)
	assert.Equal(t, before, calls.Load(), "switching windows must reuse the official-source cache")
	assert.Equal(t, snapshot.Providers[3].History[60:], short.Providers[3].History)
}

func TestOfficialOtherPublicationsKeepProductAndCalendarScope(t *testing.T) {
	client, _, _ := officialFixtureClient(t)
	aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
	now := time.Date(2026, 9, 16, 4, 30, 0, 0, time.UTC)
	aggregator.now = func() time.Time { return now }
	snapshot, err := aggregator.snapshot(context.Background(), 90, []officialSource{officialSources[4], officialSources[13], officialSources[15]})
	require.NoError(t, err)
	for _, provider := range snapshot.Providers {
		require.Equal(t, "live", provider.Sync.State, provider.ID)
	}
	google := snapshot.Providers[0]
	require.Len(t, google.Services, 1, "omit the unverified Developer API without assigning chat status to it")
	assert.Equal(t, "Gemini Web & App", google.Services[0].Name)
	assert.Equal(t, "chat", google.Services[0].Kind)
	assert.Equal(t, OfficialOperational, google.Status)
	assert.True(t, slices.ContainsFunc(google.History, func(day OfficialDay) bool {
		return day.Complete && day.Status == OfficialOperational
	}), "omitted placeholders must not turn the published chat history gray")
	assert.Len(t, google.Incidents, 1, "other Google products and out-of-window events are excluded")
	together := snapshot.Providers[1]
	assert.Equal(t, OfficialOperational, together.Status, "empty groups must not obscure published component states")
	for _, service := range together.Services {
		assert.NotEmpty(t, service.Components)
		assert.NotEqual(t, OfficialUnknown, service.Status)
	}
	// The publication includes June 18 in Pacific time, which can cover June
	// 19 UTC together with its next local day. Its own first UTC day is partial.
	assert.Equal(t, OfficialOperational, together.Services[0].History[0].Status)
	firstPublishedDay := time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC)
	firstService := together.Services[0]
	firstService.Coverage.From = &firstPublishedDay
	boundary := officialHistory(firstService, together.Incidents, firstPublishedDay, 2, now, false)
	assert.False(t, boundary[0].Complete, "a Pacific calendar day does not cover the first seven hours of the UTC day")
	assert.Equal(t, OfficialUnknown, boundary[0].Status)
	assert.Equal(t, OfficialOperational, boundary[1].Status)
	openrouter := snapshot.Providers[2]
	assert.True(t, slices.ContainsFunc(openrouter.Incidents, func(e OfficialIncident) bool { return e.EndAt != nil && e.Impact == OfficialDegraded }))
	assert.Equal(t, OfficialUnknown, openrouter.History[0].Status, "an unbounded config incident list does not certify missing history")
}

func TestOfficialRecoveredOutageKeepsUTCImpactIntervals(t *testing.T) {
	for _, tc := range []struct {
		name, end string
		next      OfficialState
	}{
		{"crosses midnight", "2026-09-15T01:30:00Z", OfficialMajor},
		{"ends exactly at midnight", "2026-09-15T00:00:00Z", OfficialOperational},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var raw officialXAIIncident
			require.NoError(t, common.UnmarshalJsonStr(`{"id":"INC-test","title":"Models outage","status":"resolved","severity":"available","startTime":"2026-09-14T23:00:00Z","endTime":"`+tc.end+`","updates":[{"title":"Recovered","description":"Traffic is healthy","createTime":"`+tc.end+`","severity":"available"},{"title":"Investigating","createTime":"2026-09-14T23:00:00Z","severity":"outage"}]}`, &raw))
			event, current, err := officialParseXAIIncident(raw, "grok-com", "https://status.x.ai")
			require.NoError(t, err)
			assert.Equal(t, OfficialOperational, current)
			assert.Equal(t, OfficialMajor, event.Impact)
			start := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
			now := start.Add(60 * time.Hour)
			service := OfficialService{Components: []OfficialComponent{{ID: "grok-com", Status: current}}, Coverage: OfficialCoverage{From: &start, To: &now}}
			days := officialHistory(service, []OfficialIncident{event}, start, 3, now, false)
			assert.Equal(t, []OfficialState{OfficialMajor, tc.next, OfficialOperational}, []OfficialState{days[0].Status, days[1].Status, days[2].Status})
			assert.Equal(t, []string{"INC-test"}, days[0].IncidentIDs)
		})
	}
}

func TestOfficialMissingHistoryAndUnknownScopeNeverBecomeHealthy(t *testing.T) {
	start := time.Date(2026, 9, 14, 0, 0, 0, 0, time.UTC)
	now := start.Add(60 * time.Hour)
	service := OfficialService{Components: []OfficialComponent{{ID: "api", Status: OfficialOperational}}}
	days := officialHistory(service, nil, start, 3, now, false)
	assert.Equal(t, OfficialUnknown, days[0].Status)
	assert.False(t, days[0].Complete)
	end := start.Add(time.Hour)
	event := OfficialIncident{ID: "unscoped", Impacts: []OfficialImpact{{Status: OfficialMajor, StartAt: start, EndAt: &end}}}
	service.Coverage = OfficialCoverage{From: &start, To: &now}
	days = officialHistory(service, []OfficialIncident{event}, start, 3, now, false)
	assert.Equal(t, OfficialUnknown, days[0].Status)
	assert.Empty(t, days[0].IncidentIDs, "do not assign an unscoped announcement to an API")
	providerDays := officialHistory(OfficialService{}, []OfficialIncident{event}, start, 3, now, true)
	assert.Equal(t, OfficialMajor, providerDays[0].Status)
	assert.Equal(t, []string{"unscoped"}, providerDays[0].IncidentIDs)
	service.ID = "api"
	event.Impacts[0].ServiceIDs = []string{"api"}
	days = officialHistory(service, []OfficialIncident{event}, start, 3, now, false)
	assert.Equal(t, OfficialMajor, days[0].Status, "an official service-group impact applies to that group")
	service.ID = "chat"
	days = officialHistory(service, []OfficialIncident{event}, start, 3, now, false)
	assert.Equal(t, OfficialOperational, days[0].Status, "a group impact must not leak into another product")
	// A stale midday snapshot cannot certify the rest of yesterday.
	through := start.Add(12 * time.Hour)
	service.Coverage.To = &through
	days = officialHistory(service, nil, start, 3, now, false)
	assert.False(t, days[0].Complete)
	assert.Equal(t, OfficialUnknown, days[1].Status)
}

func TestOfficialBackfilledClaudeNoticeDoesNotInventAnImpactWindow(t *testing.T) {
	// Public incident 1019wwb67615 has a later started_at than its backfilled
	// publication/resolution timestamp, and declares no component impact.
	var raw officialStatuspageIncident
	require.NoError(t, common.UnmarshalJsonStr(`{"id":"1019wwb67615","name":"Sonnet 4.6 and Sonnet 5 errors elevated","status":"resolved","created_at":"2026-07-25T18:13:01.000Z","updated_at":"2026-08-14T10:28:23.571Z","resolved_at":"2026-07-25T18:13:01.000Z","impact":"none","started_at":"2026-07-25T18:14:56.438Z","components":[],"incident_updates":[{"status":"resolved","body":"For approximately 10 minutes, error rates on Sonnet 4.6 and 5 were elevated.","created_at":"2026-07-25T18:14:56.479Z","display_at":"2026-07-25T18:13:01.000Z","affected_components":null}]}`, &raw))
	event, err := officialParseStatuspageIncident(raw, "https://status.claude.com")
	require.NoError(t, err)
	require.NotNil(t, event.EndAt)
	assert.Equal(t, *event.EndAt, event.StartAt)
	assert.Equal(t, OfficialUnknown, event.Impact)
	start := time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC)
	now := start.Add(48 * time.Hour)
	days := officialHistory(OfficialService{Coverage: OfficialCoverage{From: &start, To: &now}}, []OfficialIncident{event}, start, 1, now, true)
	assert.Equal(t, OfficialUnknown, days[0].Status)
	assert.False(t, days[0].Complete)
	assert.Equal(t, []string{"1019wwb67615"}, days[0].IncidentIDs)
}

func TestOfficialBackfilledGroqHistoryUsesPublishedDisplayTimes(t *testing.T) {
	// https://groqstatus.com/api/v2/incidents.json: this December 14 incident
	// was entered on December 17, without started_at or a component scope.
	var raw officialStatuspageIncident
	require.NoError(t, common.UnmarshalJsonStr(`{"id":"01KCNJCXJRRZB6WJE7A844VE3Q","name":"Data Center Failure Impacting Capacity - DMM1","status":"resolved","impact":"minor","started_at":null,"created_at":"2025-12-17T07:11:39Z","updated_at":"2026-03-12T18:22:51Z","resolved_at":"2025-12-14T13:30:00Z","components":null,"incident_updates":[{"body":"The data center capacity issue has been resolved.","created_at":"2025-12-17T07:11:39Z","display_at":"2025-12-14T13:30:00Z"},{"body":"We are currently investigating a potential network issue at our DMM1.","created_at":"2025-12-17T07:11:39Z","display_at":"2025-12-14T09:46:00Z"}]}`, &raw))
	event, err := officialParseStatuspageIncident(raw, "https://groqstatus.com")
	require.NoError(t, err)
	assert.Equal(t, time.Date(2025, 12, 14, 9, 46, 0, 0, time.UTC), event.StartAt)
	require.NotNil(t, event.EndAt)
	assert.Equal(t, time.Date(2025, 12, 14, 13, 30, 0, 0, time.UTC), *event.EndAt)
	assert.Equal(t, OfficialDegraded, event.Impact)
	assert.Empty(t, event.ComponentIDs, "do not infer a product from an unscoped notice")
}

func TestOfficialSourceFailuresPreserveSuccessAndIsolateProviders(t *testing.T) {
	client, bodies, _ := officialFixtureClient(t)
	aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
	now := time.Date(2026, 9, 16, 4, 30, 0, 0, time.UTC)
	aggregator.now = func() time.Time { return now }
	first, err := aggregator.snapshot(context.Background(), 90, officialSources[:4])
	require.NoError(t, err)
	require.Equal(t, "live", first.Providers[0].Sync.State)
	delete(bodies, "https://status.openai.com/api/v2/components.json")
	now = now.Add(6 * time.Minute)
	second, err := aggregator.snapshot(context.Background(), 90, officialSources[:4])
	require.NoError(t, err)
	assert.Equal(t, "stale", second.Providers[0].Sync.State)
	assert.Equal(t, first.Providers[0].Sync.LastSuccessAt, second.Providers[0].Sync.LastSuccessAt)
	assert.Equal(t, first.Providers[0].Incidents, second.Providers[0].Incidents)
	assert.Equal(t, "live", second.Providers[1].Sync.State)
	assert.Equal(t, "live", second.Providers[2].Sync.State)
	assert.Equal(t, "live", second.Providers[3].Sync.State)
	fresh := newOfficialStatusAggregator(func() *http.Client { return client })
	fresh.now = aggregator.now
	unknown, err := fresh.snapshot(context.Background(), 30, officialSources[:1])
	require.NoError(t, err)
	assert.Equal(t, "unavailable", unknown.Providers[0].Sync.State)
	assert.Equal(t, OfficialUnknown, unknown.Providers[0].Status)
	assert.Nil(t, unknown.Providers[0].Sync.LastSuccessAt)
}

func TestOfficialSchemaChangesFailExplicitly(t *testing.T) {
	for _, tc := range []struct{ name, key, body string }{
		{"unknown state", "https://status.openai.com/api/v2/components.json", `{"components":[{"id":"api","name":"API","status":"brand-new-state"}]}`},
		{"missing grouped component", "https://status.openai.com/api/v2/components.json", `{"components":[{"id":"api","name":"API","status":"operational"}]}`},
		{"missing components", "https://status.claude.com/api/v2/components.json", `{"components":[]}`},
		{"wrong hosted page", officialDeepSeekAPI + "/summary/active", `{"data":{"page":{"page_id":6410630422455,"custom_domain":"someone-else.example"},"active_changes":[]}}`},
		{"missing xAI product", "https://status.x.ai/grok-com.txt", `1:{"product":{"name":"Grok","slug":"grok-com"}}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client, bodies, _ := officialFixtureClient(t)
			if tc.name == "unknown state" {
				bodies[tc.key] = []byte(strings.Replace(string(bodies[tc.key]), "operational", "brand-new-state", 1))
			} else {
				bodies[tc.key] = []byte(tc.body)
			}
			aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
			snapshot, err := aggregator.snapshot(context.Background(), 90, officialSources[:4])
			require.NoError(t, err)
			assert.True(t, slices.ContainsFunc(snapshot.Providers, func(p OfficialProvider) bool {
				return p.Sync.Error == "source_format_changed" && p.Status == OfficialUnknown
			}))
		})
	}
}

func TestOfficialRequestsCoalesceAndRespectConcurrencyLimit(t *testing.T) {
	fixtureClient, _, calls := officialFixtureClient(t)
	started, release := make(chan struct{}, 32), make(chan struct{})
	var concurrent, peak atomic.Int64
	client := &http.Client{Transport: officialRoundTripFunc(func(r *http.Request) (*http.Response, error) {
		active := concurrent.Add(1)
		defer concurrent.Add(-1)
		for previous := peak.Load(); active > previous && !peak.CompareAndSwap(previous, active); previous = peak.Load() {
		}
		select {
		case started <- struct{}{}:
		default:
		}
		select {
		case <-release:
		case <-r.Context().Done():
			return nil, r.Context().Err()
		}
		return fixtureClient.Transport.RoundTrip(r)
	})}
	aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
	sources := make([]officialSource, 8)
	for i := range sources {
		sources[i] = officialSource{id: fmt.Sprint(i), name: "API", url: "https://status.openai.com", adapter: "statuspage"}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	var wg sync.WaitGroup
	wg.Go(func() { _, _ = aggregator.snapshot(ctx, 90, sources) })
	wg.Go(func() { _, _ = aggregator.snapshot(ctx, 30, sources) })
	for range 6 {
		select {
		case <-started:
		case <-ctx.Done():
			require.FailNow(t, "six independent sources did not start")
		}
	}
	close(release)
	wg.Wait()
	assert.EqualValues(t, 6, peak.Load())
	assert.EqualValues(t, 24, calls.Load(), "each provider fetches components and two incident pages once, shared by both windows")
}

func TestOfficialTimeoutAndInvalidWindow(t *testing.T) {
	client := &http.Client{Transport: officialRoundTripFunc(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })}
	aggregator := newOfficialStatusAggregator(func() *http.Client { return client })
	// An already-expired request deadline tests the failure path deterministically.
	aggregator.timeout = -time.Nanosecond
	snapshot, err := aggregator.snapshot(context.Background(), 90, officialSources[:1])
	require.NoError(t, err)
	assert.Equal(t, "unavailable", snapshot.Providers[0].Sync.State)
	assert.Equal(t, OfficialUnknown, snapshot.Providers[0].Status)
	_, err = aggregator.snapshot(context.Background(), 31, officialSources[:1])
	require.EqualError(t, err, "days must be 30 or 90")
}

func TestOfficialLiveCoreSources(t *testing.T) {
	if os.Getenv("NEW_API_VERIFY_OFFICIAL_STATUS") != "1" {
		t.Skip("set NEW_API_VERIFY_OFFICIAL_STATUS=1 to verify real official publications")
	}
	InitHttpClient()
	aggregator := newOfficialStatusAggregator(GetHttpClient)
	snapshot, err := aggregator.snapshot(context.Background(), 90, officialSources[:4])
	require.NoError(t, err)
	for _, provider := range snapshot.Providers {
		require.Equal(t, "live", provider.Sync.State, "%s: %s", provider.ID, provider.Sync.Error)
		assert.NotEmpty(t, provider.Sources)
		assert.NotEmpty(t, provider.Incidents)
		assert.True(t, slices.ContainsFunc(provider.Services, func(s OfficialService) bool { return s.Kind == "api" && len(s.Components) > 0 }))
		assert.True(t, slices.ContainsFunc(provider.Services, func(s OfficialService) bool { return s.Kind == "chat" && len(s.Components) > 0 }))
	}
}
