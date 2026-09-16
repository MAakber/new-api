package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"golang.org/x/sync/singleflight"
)

type OfficialState string

const (
	OfficialOperational OfficialState = "operational"
	OfficialDegraded    OfficialState = "degraded"
	OfficialPartial     OfficialState = "partial_outage"
	OfficialMajor       OfficialState = "major_outage"
	OfficialMaintenance OfficialState = "maintenance"
	OfficialUnknown     OfficialState = "unknown"
)

type OfficialStatusSnapshot struct {
	Days        int                `json:"days"`
	Timezone    string             `json:"timezone"`
	GeneratedAt time.Time          `json:"generated_at"`
	Providers   []OfficialProvider `json:"providers"`
}

type OfficialSync struct {
	State         string     `json:"state"` // live, stale, unavailable, unconfigured
	CheckedAt     time.Time  `json:"checked_at"`
	LastSuccessAt *time.Time `json:"last_success_at,omitempty"`
	Error         string     `json:"error,omitempty"`
}

type OfficialCoverage struct {
	From   *time.Time `json:"from,omitempty"`
	To     *time.Time `json:"to,omitempty"`
	Reason string     `json:"reason,omitempty"`
}

type OfficialDay struct {
	Date        string        `json:"date"`
	Status      OfficialState `json:"status"`
	Complete    bool          `json:"complete"`
	IncidentIDs []string      `json:"incident_ids"`
}

type OfficialAvailability struct {
	Days    int       `json:"days"`
	Percent float64   `json:"percent"`
	From    time.Time `json:"from"`
	To      time.Time `json:"to"`
}

type OfficialComponent struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Status       OfficialState          `json:"status"`
	Availability []OfficialAvailability `json:"availability,omitempty"`
	Since        time.Time              `json:"-"`
}

type OfficialService struct {
	ID         string              `json:"id"`
	Name       string              `json:"name"`
	Kind       string              `json:"kind"` // api, chat, other
	URL        string              `json:"url"`
	Status     OfficialState       `json:"status"`
	Components []OfficialComponent `json:"components"`
	Coverage   OfficialCoverage    `json:"coverage"`
	History    []OfficialDay       `json:"history"`
	// Some publishers supply local-calendar daily summaries. They can prove a
	// UTC day healthy only when healthy observations cover that entire UTC day.
	observations []officialObservation
}

type OfficialImpact struct {
	ComponentIDs []string      `json:"component_ids"`
	ServiceIDs   []string      `json:"service_ids,omitempty"`
	Status       OfficialState `json:"status"`
	StartAt      time.Time     `json:"start_at"`
	EndAt        *time.Time    `json:"end_at,omitempty"`
}

type OfficialIncident struct {
	ID           string           `json:"id"`
	Title        string           `json:"title"`
	Body         string           `json:"body"`
	URL          string           `json:"url"`
	Status       string           `json:"status"` // original publication state
	Impact       OfficialState    `json:"impact"`
	StartAt      time.Time        `json:"start_at"`
	EndAt        *time.Time       `json:"end_at,omitempty"`
	UpdatedAt    time.Time        `json:"updated_at"`
	ComponentIDs []string         `json:"component_ids"`
	ServiceIDs   []string         `json:"service_ids,omitempty"`
	Impacts      []OfficialImpact `json:"impacts"`
}

type OfficialProvider struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Icon      string             `json:"icon"`
	URL       string             `json:"url"`
	Sources   []string           `json:"sources"`
	Status    OfficialState      `json:"status"`
	Sync      OfficialSync       `json:"sync"`
	Services  []OfficialService  `json:"services"`
	Incidents []OfficialIncident `json:"incidents"`
	History   []OfficialDay      `json:"history"`
}

type officialObservation struct {
	ComponentID string
	From, To    time.Time
	Status      OfficialState
}

type officialSource struct {
	id, name, icon, url, adapter string
	services                     []OfficialService
}

// Only this fixed registry can initiate outbound requests. It is independent
// of channels, relay traffic, model credentials, and administrator fetch URLs.
var officialSources = []officialSource{
	{id: "openai", name: "OpenAI", icon: "OpenAI", url: "https://status.openai.com", adapter: "statuspage"},
	{id: "anthropic", name: "Anthropic", icon: "Claude.Color", url: "https://status.claude.com", adapter: "statuspage"},
	{id: "xai", name: "xAI", icon: "Grok", url: "https://status.x.ai", adapter: "xai"},
	{id: "deepseek", name: "DeepSeek", icon: "DeepSeek.Color", url: "https://statuspage.flashduty.com/deepseek", adapter: "deepseek"},
	{id: "google", name: "Google", icon: "Gemini.Color", url: "https://www.google.com/appsstatus/dashboard/", adapter: "google"},
	{id: "qwen", name: "Qwen", icon: "Qwen.Color", url: "https://qwen.ai", services: []OfficialService{{ID: "api", Name: "DashScope API", Kind: "api", URL: "https://www.alibabacloud.com/product/model-studio"}, {ID: "chat", Name: "Qwen Chat", Kind: "chat", URL: "https://chat.qwen.ai"}}},
	{id: "doubao", name: "Doubao", icon: "Doubao.Color", url: "https://www.doubao.com", services: []OfficialService{{ID: "api", Name: "Volcengine Ark API", Kind: "api", URL: "https://www.volcengine.com/product/ark"}, {ID: "chat", Name: "Doubao", Kind: "chat", URL: "https://www.doubao.com"}}},
	{id: "kimi", name: "Kimi", icon: "Moonshot", url: "https://www.kimi.com", services: []OfficialService{{ID: "api", Name: "Moonshot API", Kind: "api", URL: "https://platform.moonshot.cn"}, {ID: "chat", Name: "Kimi", Kind: "chat", URL: "https://www.kimi.com"}}},
	{id: "glm", name: "GLM", icon: "Zhipu.Color", url: "https://www.z.ai", services: []OfficialService{{ID: "api", Name: "Z.ai API", Kind: "api", URL: "https://open.bigmodel.cn"}, {ID: "chat", Name: "GLM Chat", Kind: "chat", URL: "https://chat.z.ai"}}},
	{id: "minimax", name: "MiniMax", icon: "Minimax.Color", url: "https://www.minimax.io", services: []OfficialService{{ID: "api", Name: "MiniMax API", Kind: "api", URL: "https://platform.minimax.io"}, {ID: "chat", Name: "MiniMax Agent", Kind: "chat", URL: "https://agent.minimax.io"}}},
	{id: "mistral", name: "Mistral", icon: "Mistral.Color", url: "https://status.mistral.ai", services: []OfficialService{{ID: "api", Name: "La Plateforme API", Kind: "api", URL: "https://console.mistral.ai"}, {ID: "chat", Name: "Le Chat", Kind: "chat", URL: "https://chat.mistral.ai"}}},
	{id: "cohere", name: "Cohere", icon: "Cohere.Color", url: "https://status.cohere.com", adapter: "statuspage"},
	{id: "groq", name: "Groq", icon: "Groq", url: "https://groqstatus.com", adapter: "statuspage"},
	{id: "together", name: "Together AI", icon: "Together.Color", url: "https://status.together.ai", adapter: "together"},
	{id: "fireworks", name: "Fireworks AI", icon: "Fireworks.Color", url: "https://status.fireworks.ai", adapter: "statuspage"},
	{id: "openrouter", name: "OpenRouter", icon: "OpenRouter", url: "https://status.openrouter.ai", adapter: "openrouter"},
}

type officialCacheEntry struct {
	provider OfficialProvider
	expires  time.Time
}

type officialStatusAggregator struct {
	mu      sync.RWMutex
	cache   map[string]officialCacheEntry
	flights singleflight.Group
	slots   chan struct{}
	client  func() *http.Client
	now     func() time.Time
	timeout time.Duration
}

func newOfficialStatusAggregator(client func() *http.Client) *officialStatusAggregator {
	return &officialStatusAggregator{cache: make(map[string]officialCacheEntry), slots: make(chan struct{}, 6), client: client, now: time.Now, timeout: 8 * time.Second}
}

var officialStatus = newOfficialStatusAggregator(GetHttpClient)

func GetOfficialStatus(ctx context.Context, days int) (*OfficialStatusSnapshot, error) {
	return officialStatus.snapshot(ctx, days, officialSources)
}

func (a *officialStatusAggregator) snapshot(ctx context.Context, days int, sources []officialSource) (*OfficialStatusSnapshot, error) {
	if days != 30 && days != 90 {
		return nil, errors.New("days must be 30 or 90")
	}
	providers := make([]OfficialProvider, len(sources))
	var wg sync.WaitGroup
	for i, source := range sources {
		wg.Go(func() { providers[i] = a.provider(ctx, source) })
	}
	wg.Wait()
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	now := a.now().UTC()
	for i := range providers {
		providers[i] = officialProviderWindow(providers[i], days, now)
	}
	return &OfficialStatusSnapshot{Days: days, Timezone: "UTC", GeneratedAt: now, Providers: providers}, nil
}

func (a *officialStatusAggregator) provider(ctx context.Context, source officialSource) OfficialProvider {
	a.mu.RLock()
	entry, exists := a.cache[source.id]
	a.mu.RUnlock()
	if exists && a.now().Before(entry.expires) {
		return entry.provider
	}
	result := a.flights.DoChan(source.id, func() (any, error) {
		a.mu.RLock()
		previous, found := a.cache[source.id]
		a.mu.RUnlock()
		if found && a.now().Before(previous.expires) {
			return previous.provider, nil
		}
		// A disconnected visitor must not cancel a refresh shared by others.
		fetchCtx, cancel := context.WithTimeout(context.Background(), time.Minute)
		defer cancel()
		now := a.now().UTC()
		p := OfficialProvider{ID: source.id, Name: source.name, Icon: source.icon, URL: source.url, Sources: []string{source.url}, Status: OfficialUnknown, Sync: OfficialSync{State: "unconfigured", CheckedAt: now}, Services: slices.Clone(source.services), Incidents: []OfficialIncident{}}
		fetcher := officialFetcher{aggregator: a, ctx: fetchCtx, now: now}
		var err error
		switch source.adapter {
		case "statuspage":
			err = fetcher.statuspage(&p)
		case "xai":
			err = fetcher.xai(&p)
		case "deepseek":
			err = fetcher.deepseek(&p)
		case "together":
			err = fetcher.together(&p)
		case "openrouter":
			err = fetcher.openrouter(&p)
		case "google":
			err = fetcher.google(&p)
		}
		if err != nil {
			if found && previous.provider.Sync.LastSuccessAt != nil {
				p = previous.provider
				p.Sync.State = "stale"
			} else {
				p.Services = slices.Clone(source.services)
				p.Incidents = []OfficialIncident{}
				p.Sync.State = "unavailable"
			}
			p.Sync.Error = "source_unavailable"
			if errors.Is(err, errOfficialFormat) {
				p.Sync.Error = "source_format_changed"
			}
			p.Sync.CheckedAt = a.now().UTC()
			common.SysError(fmt.Sprintf("official status %s: %v", source.id, err))
		} else if source.adapter != "" {
			p.Sync = OfficialSync{State: "live", CheckedAt: a.now().UTC(), LastSuccessAt: &now}
			p.Sources = fetcher.sources
		}
		if len(p.Services) == 0 {
			p.Services = []OfficialService{{ID: "api", Name: source.name + " API", Kind: "api", URL: source.url}, {ID: "chat", Name: source.name, Kind: "chat", URL: source.url}}
		}
		a.mu.Lock()
		a.cache[source.id] = officialCacheEntry{provider: p, expires: a.now().Add(5 * time.Minute)}
		a.mu.Unlock()
		return p, nil
	})
	select {
	case <-ctx.Done():
		return OfficialProvider{}
	case value := <-result:
		return value.Val.(OfficialProvider)
	}
}

var errOfficialFormat = errors.New("unrecognized official status format")

type officialFetcher struct {
	aggregator *officialStatusAggregator
	ctx        context.Context
	now        time.Time
	sources    []string
}

func (f *officialFetcher) get(url string, target any) ([]byte, error) {
	f.sources = append(f.sources, url)
	select {
	case f.aggregator.slots <- struct{}{}:
	case <-f.ctx.Done():
		return nil, f.ctx.Err()
	}
	defer func() { <-f.aggregator.slots }()
	ctx, cancel := context.WithTimeout(f.ctx, f.aggregator.timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json, text/plain, application/xml, text/html")
	client := f.aggregator.client()
	if client == nil {
		return nil, errors.New("outbound HTTP client is not initialized")
	}
	response, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", url, response.StatusCode)
	}
	const maxBody = 8 << 20
	body, err := io.ReadAll(io.LimitReader(response.Body, maxBody+1))
	if err != nil {
		return nil, err
	}
	if len(body) > maxBody {
		return nil, fmt.Errorf("%w: response too large", errOfficialFormat)
	}
	if target != nil {
		if err := common.Unmarshal(body, target); err != nil {
			return nil, fmt.Errorf("%w: %s: %v", errOfficialFormat, url, err)
		}
	}
	return body, nil
}

func officialState(raw string) (OfficialState, error) {
	switch strings.ToLower(raw) {
	case "operational", "available", "up", "none":
		return OfficialOperational, nil
	case "degraded_performance", "degraded", "minor":
		return OfficialDegraded, nil
	case "partial_outage", "major", "disruption":
		return OfficialPartial, nil
	case "major_outage", "full_outage", "outage", "critical", "down":
		return OfficialMajor, nil
	case "under_maintenance", "maintenance":
		return OfficialMaintenance, nil
	case "unknown", "info":
		return OfficialUnknown, nil
	default:
		return OfficialUnknown, fmt.Errorf("%w: unknown state %q", errOfficialFormat, raw)
	}
}

func officialWorst(states ...OfficialState) OfficialState {
	severity := map[OfficialState]int{OfficialOperational: 0, OfficialUnknown: 1, "": 1, OfficialMaintenance: 2, OfficialDegraded: 3, OfficialPartial: 4, OfficialMajor: 5}
	worst := OfficialOperational
	for _, state := range states {
		if severity[state] > severity[worst] {
			worst = state
		}
	}
	if worst == "" {
		return OfficialUnknown
	}
	return worst
}

func officialDayStart(t time.Time) time.Time {
	return t.UTC().Truncate(24 * time.Hour)
}

func officialTime(raw string) (time.Time, error) {
	value, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return time.Time{}, fmt.Errorf("%w: invalid event timestamp", errOfficialFormat)
	}
	return value.UTC(), nil
}

func officialProviderWindow(p OfficialProvider, days int, now time.Time) OfficialProvider {
	start := officialDayStart(now).AddDate(0, 0, 1-days)
	p.Services = slices.Clone(p.Services)
	p.Status = OfficialOperational
	for i := range p.Services {
		s := &p.Services[i]
		s.Status = OfficialOperational
		if len(s.Components) == 0 {
			s.Components = []OfficialComponent{}
			s.Status = OfficialUnknown
		}
		for _, c := range s.Components {
			s.Status = officialWorst(s.Status, c.Status)
		}
		s.History = officialHistory(*s, p.Incidents, start, days, now, false)
	}
	// Summarize only products with a published current state. Keep the unknown
	// record for source diagnostics when the provider has no usable state at all.
	if slices.ContainsFunc(p.Services, func(s OfficialService) bool { return s.Status != OfficialUnknown }) {
		p.Services = slices.DeleteFunc(p.Services, func(s OfficialService) bool { return s.Status == OfficialUnknown })
	}
	for _, service := range p.Services {
		p.Status = officialWorst(p.Status, service.Status)
	}
	// Provider-level announcements remain here even when their product scope is
	// unknown. They never become API/chat incidents through a name heuristic.
	p.History = make([]OfficialDay, days)
	for i := range days {
		day := OfficialDay{Date: start.AddDate(0, 0, i).Format(time.DateOnly), Status: OfficialOperational, Complete: true, IncidentIDs: []string{}}
		for _, service := range p.Services {
			d := service.History[i]
			day.Status = officialWorst(day.Status, d.Status)
			day.Complete = day.Complete && d.Complete
			for _, id := range d.IncidentIDs {
				if !slices.Contains(day.IncidentIDs, id) {
					day.IncidentIDs = append(day.IncidentIDs, id)
				}
			}
		}
		p.History[i] = day
	}
	announcements := officialHistory(OfficialService{}, p.Incidents, start, days, now, true)
	for i, d := range announcements {
		if len(d.IncidentIDs) > 0 {
			p.History[i].Status = officialWorst(p.History[i].Status, d.Status)
			for _, id := range d.IncidentIDs {
				if !slices.Contains(p.History[i].IncidentIDs, id) {
					p.History[i].IncidentIDs = append(p.History[i].IncidentIDs, id)
				}
			}
		}
	}
	p.Incidents = slices.DeleteFunc(slices.Clone(p.Incidents), func(event OfficialIncident) bool { return event.EndAt != nil && !event.EndAt.After(start) })
	slices.SortFunc(p.Incidents, func(a, b OfficialIncident) int { return b.StartAt.Compare(a.StartAt) })
	return p
}

func officialHistory(service OfficialService, events []OfficialIncident, start time.Time, days int, now time.Time, provider bool) []OfficialDay {
	daily := make([]OfficialDay, days)
	ids := make(map[string]bool, len(service.Components))
	for _, component := range service.Components {
		ids[component.ID] = true
	}
	for i := range days {
		from := start.AddDate(0, 0, i)
		to := from.AddDate(0, 0, 1)
		observedTo := to
		if to.After(now) {
			observedTo = now
		}
		covered := service.Coverage.From != nil && !from.Before(*service.Coverage.From) && service.Coverage.To != nil && !from.After(*service.Coverage.To)
		// Past days require a complete day of evidence; today is observed only
		// through the last synchronization, which is returned in coverage.to.
		if covered && from.Before(officialDayStart(now)) && to.After(*service.Coverage.To) {
			covered = false
		}
		for _, component := range service.Components {
			if !component.Since.IsZero() && from.Before(component.Since) {
				covered = false
			}
			if len(service.observations) > 0 {
				until := from
				for _, observation := range service.observations {
					if observation.ComponentID == component.ID && observation.Status == OfficialOperational && !observation.From.After(until) && observation.To.After(until) {
						until = observation.To
					}
				}
				covered = covered && !until.Before(observedTo)
			}
		}
		day := OfficialDay{Date: from.Format(time.DateOnly), Status: OfficialUnknown, Complete: covered, IncidentIDs: []string{}}
		if covered {
			day.Status = OfficialOperational
		}
		for _, event := range events {
			for _, impact := range event.Impacts {
				end := now
				if service.Coverage.To != nil {
					end = *service.Coverage.To
				}
				if impact.EndAt != nil {
					end = *impact.EndAt
				}
				if !impact.StartAt.Before(to) || !end.After(from) {
					continue
				}
				if !provider && len(impact.ComponentIDs) == 0 && len(impact.ServiceIDs) == 0 {
					day.Complete = false
					day.Status = officialWorst(day.Status, OfficialUnknown)
					continue
				}
				if !provider && !slices.Contains(impact.ServiceIDs, service.ID) && !slices.ContainsFunc(impact.ComponentIDs, func(id string) bool { return ids[id] }) {
					continue
				}
				day.Status = officialWorst(day.Status, impact.Status)
				if impact.Status == OfficialUnknown {
					day.Complete = false
				}
				if !slices.Contains(day.IncidentIDs, event.ID) {
					day.IncidentIDs = append(day.IncidentIDs, event.ID)
				}
			}
		}
		daily[i] = day
	}
	return daily
}
