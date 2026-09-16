package service

import (
	"fmt"
	"slices"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type officialStatuspageComponent struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Group     bool   `json:"group"`
	GroupID   string `json:"group_id"`
	StartDate string `json:"start_date"`
	CreatedAt string `json:"created_at"`
}

type officialStatuspageIncident struct {
	ID             string                        `json:"id"`
	Name           string                        `json:"name"`
	Status         string                        `json:"status"`
	Impact         string                        `json:"impact"`
	CreatedAt      string                        `json:"created_at"`
	StartedAt      string                        `json:"started_at"`
	UpdatedAt      string                        `json:"updated_at"`
	Resolved       string                        `json:"resolved_at"`
	ScheduledFor   string                        `json:"scheduled_for"`
	ScheduledUntil string                        `json:"scheduled_until"`
	Components     []officialStatuspageComponent `json:"components"`
	Updates        []struct {
		Body      string `json:"body"`
		CreatedAt string `json:"created_at"`
		DisplayAt string `json:"display_at"`
		Affected  []struct {
			Code string `json:"code"`
			Old  string `json:"old_status"`
			New  string `json:"new_status"`
		} `json:"affected_components"`
	} `json:"incident_updates"`
}

func (f *officialFetcher) statuspage(p *OfficialProvider) error {
	var components struct {
		Components []officialStatuspageComponent `json:"components"`
	}
	if _, err := f.get(p.URL+"/api/v2/components.json", &components); err != nil {
		return err
	}
	if len(components.Components) == 0 {
		return fmt.Errorf("%w: missing components", errOfficialFormat)
	}
	groups := map[string]string{}
	if p.ID == "openai" {
		body, err := f.get(p.URL+"/", nil)
		if err != nil {
			return err
		}
		groups, err = officialOpenAIGroups(body)
		if err != nil {
			return err
		}
	}
	services := map[string]int{}
	componentIDs := make(map[string]bool, len(components.Components))
	for _, component := range components.Components {
		componentIDs[component.ID] = true
	}
	for id := range groups {
		if !componentIDs[id] {
			return fmt.Errorf("%w: grouped OpenAI component missing", errOfficialFormat)
		}
	}
	for _, c := range components.Components {
		if c.Group {
			continue
		}
		if c.ID == "" || c.Name == "" {
			return errOfficialFormat
		}
		state, err := officialState(c.Status)
		if err != nil {
			return err
		}
		id, name, kind := c.ID, c.Name, "other"
		switch p.ID {
		case "openai":
			if group, exists := groups[c.ID]; exists {
				id, name = group, group
				if group == "APIs" {
					kind = "api"
				}
				if group == "ChatGPT" {
					kind = "chat"
				}
			}
		case "anthropic":
			switch c.ID {
			case "k8w3r06qmzrp":
				id, name, kind = "api", "Claude API", "api"
			case "rwppv331jlwc":
				id, name, kind = "chat", "claude.ai", "chat"
			}
		case "groq":
			if c.ID != "01K053E2FAFPVT8SKR4T23WHQK" {
				id, name, kind = "api", "Groq API", "api"
			}
		case "fireworks":
			id, name, kind = "api", "Fireworks API", "api"
		case "cohere":
			switch c.ID {
			case "01HPSDNEQZNDBHHC90FDBS70EP", "01HPSDNEQZM6R7MGPCN9VPZ83H", "01HTQRNEDQQ9E16WRMZF16HH40", "01HPSPCNBW0R74QDXBWQ10RTC0":
			default:
				id, name, kind = "api", "Cohere API", "api"
			}
		}
		index, exists := services[id]
		if !exists {
			index = len(p.Services)
			services[id] = index
			p.Services = append(p.Services, OfficialService{ID: id, Name: name, Kind: kind, URL: p.URL, Components: []OfficialComponent{}})
		}
		component := OfficialComponent{ID: c.ID, Name: c.Name, Status: state}
		if c.StartDate != "" {
			component.Since, err = time.Parse(time.DateOnly, c.StartDate)
		}
		if err != nil {
			return fmt.Errorf("%w: component start date", errOfficialFormat)
		}
		p.Services[index].Components = append(p.Services[index].Components, component)
	}
	if p.ID == "openai" && (!slices.ContainsFunc(p.Services, func(s OfficialService) bool { return s.Kind == "api" }) || !slices.ContainsFunc(p.Services, func(s OfficialService) bool { return s.Kind == "chat" })) {
		return fmt.Errorf("%w: OpenAI API/chat groups missing", errOfficialFormat)
	}
	if p.ID == "anthropic" {
		if _, ok := services["api"]; !ok {
			return fmt.Errorf("%w: Claude API component missing", errOfficialFormat)
		}
		if _, ok := services["chat"]; !ok {
			return fmt.Errorf("%w: claude.ai component missing", errOfficialFormat)
		}
	}
	// API and chat are deliberately ordered before ancillary products.
	slices.SortStableFunc(p.Services, func(a, b OfficialService) int {
		order := map[string]int{"api": 0, "chat": 1, "other": 2}
		return order[a.Kind] - order[b.Kind]
	})

	cutoff := officialDayStart(f.now).AddDate(0, 0, -89)
	coverage, reason := cutoff, ""
	seen := map[string]bool{}
	earliest := f.now
	for page := 1; page <= 8; page++ {
		url := p.URL + "/api/v2/incidents.json"
		if page > 1 {
			url += "?page=" + strconv.Itoa(page)
		}
		var response struct {
			Incidents []officialStatuspageIncident `json:"incidents"`
		}
		if _, err := f.get(url, &response); err != nil {
			return err
		}
		if response.Incidents == nil {
			return fmt.Errorf("%w: missing incident list", errOfficialFormat)
		}
		if len(response.Incidents) == 0 {
			break
		}
		added := 0
		for _, raw := range response.Incidents {
			if raw.ID == "" {
				return errOfficialFormat
			}
			if seen[raw.ID] {
				continue
			}
			seen[raw.ID], added = true, added+1
			created, err := officialTime(raw.CreatedAt)
			if err != nil {
				return err
			}
			if created.Before(earliest) {
				earliest = created
			}
			event, err := officialParseStatuspageIncident(raw, p.URL)
			if err != nil {
				return err
			}
			p.Incidents = append(p.Incidents, event)
		}
		if !earliest.After(cutoff) {
			break
		}
		if added == 0 || page == 8 {
			// A repeated page is not evidence of 90 days with no incidents.
			coverage = officialDayStart(earliest).AddDate(0, 0, 1)
			reason = "limited_history"
			break
		}
	}
	if p.ID == "anthropic" {
		var summary struct {
			Incidents   []officialStatuspageIncident `json:"incidents"`
			Maintenance []officialStatuspageIncident `json:"scheduled_maintenances"`
		}
		if _, err := f.get(p.URL+"/api/v2/summary.json", &summary); err != nil {
			return err
		}
		if summary.Incidents == nil || summary.Maintenance == nil {
			return errOfficialFormat
		}
		for _, raw := range append(summary.Incidents, summary.Maintenance...) {
			if seen[raw.ID] {
				continue
			}
			event, err := officialParseStatuspageIncident(raw, p.URL)
			if err != nil {
				return err
			}
			p.Incidents = append(p.Incidents, event)
		}
	}
	for i := range p.Services {
		p.Services[i].Coverage = OfficialCoverage{From: &coverage, To: &f.now, Reason: reason}
	}
	return nil
}

func officialParseStatuspageIncident(raw officialStatuspageIncident, base string) (OfficialIncident, error) {
	event := OfficialIncident{ID: raw.ID, Title: raw.Name, Status: raw.Status, URL: base + "/incidents/" + raw.ID, ComponentIDs: []string{}, Impacts: []OfficialImpact{}}
	if raw.ID == "" || raw.Name == "" {
		return event, errOfficialFormat
	}
	start := raw.StartedAt
	if start == "" {
		start = raw.CreatedAt
	}
	if raw.ScheduledFor != "" {
		start = raw.ScheduledFor
	}
	var err error
	event.StartAt, err = officialTime(start)
	if err != nil {
		return event, err
	}
	event.UpdatedAt, err = officialTime(raw.UpdatedAt)
	if err != nil {
		return event, err
	}
	end := raw.Resolved
	if raw.ScheduledUntil != "" {
		end = raw.ScheduledUntil
	}
	event.EndAt, err = officialEventEnd(raw.Status, end)
	if err != nil {
		return event, err
	}
	event.Impact, err = officialState(raw.Impact)
	if raw.ScheduledFor != "" {
		event.Impact, err = OfficialMaintenance, nil
	}
	if err != nil {
		return event, err
	}
	if event.Impact == OfficialOperational {
		event.Impact = OfficialUnknown
	}
	for _, c := range raw.Components {
		if !slices.Contains(event.ComponentIDs, c.ID) {
			event.ComponentIDs = append(event.ComponentIDs, c.ID)
		}
	}
	// Component states in resolved incidents are CURRENT states. Reconstruct
	// their historical transitions from the official updates instead.
	type transition struct {
		at        time.Time
		old, next OfficialState
	}
	transitions := map[string][]transition{}
	for i, update := range raw.Updates {
		if i == 0 {
			event.Body = update.Body
		}
		at := update.DisplayAt
		if at == "" {
			at = update.CreatedAt
		}
		when, err := officialTime(at)
		if err != nil {
			return event, err
		}
		// Backfilled incidents may be created after recovery. Without an
		// explicit start, use the earliest official update's display time.
		if raw.StartedAt == "" && raw.ScheduledFor == "" && when.Before(event.StartAt) {
			event.StartAt = when
		}
		for _, c := range update.Affected {
			old, err := officialState(c.Old)
			if err != nil {
				return event, err
			}
			next, err := officialState(c.New)
			if err != nil {
				return event, err
			}
			transitions[c.Code] = append(transitions[c.Code], transition{at: when, old: old, next: next})
			if !slices.Contains(event.ComponentIDs, c.Code) {
				event.ComponentIDs = append(event.ComponentIDs, c.Code)
			}
		}
	}
	if event.EndAt != nil && event.EndAt.Before(event.StartAt) {
		// A backfilled notice can also have started_at set to its entry time.
		// Equal publication/recovery timestamps and no declared component
		// impact establish a notice, but do not establish an outage duration.
		published, parseErr := officialTime(raw.CreatedAt)
		if parseErr != nil || !published.Equal(*event.EndAt) || raw.Impact != "none" || len(raw.Components) > 0 {
			return event, fmt.Errorf("%w: recovery before incident start", errOfficialFormat)
		}
		event.StartAt = published
	}
	for id, changes := range transitions {
		slices.SortFunc(changes, func(a, b transition) int { return a.at.Compare(b.at) })
		previous, from := changes[0].old, event.StartAt
		for _, change := range changes {
			at := change.at
			if previous != OfficialOperational && at.After(from) {
				event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: []string{id}, Status: previous, StartAt: from, EndAt: &at})
			}
			previous, from = change.next, at
		}
		if previous != OfficialOperational && (event.EndAt == nil || event.EndAt.After(from)) {
			event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: []string{id}, Status: previous, StartAt: from, EndAt: event.EndAt})
		}
	}
	if len(event.Impacts) == 0 {
		event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: event.ComponentIDs, Status: event.Impact, StartAt: event.StartAt, EndAt: event.EndAt})
	}
	return event, nil
}

func officialOpenAIGroups(body []byte) (map[string]string, error) {
	values, err := officialFlightData(body, true)
	if err != nil {
		return nil, err
	}
	groups := map[string]string{}
	expected := map[string]bool{"APIs": false, "ChatGPT": false}
	for _, value := range values {
		officialWalkData(value, 0, func(record map[string]any) {
			group, ok := record["group"].(map[string]any)
			if !ok {
				return
			}
			name, ok := group["name"].(string)
			if !ok {
				return
			}
			components, ok := group["components"].([]any)
			if !ok {
				return
			}
			for _, item := range components {
				component, ok := item.(map[string]any)
				if !ok {
					continue
				}
				id, ok := component["component_id"].(string)
				if ok && id != "" {
					groups[id] = name
					if _, required := expected[name]; required {
						expected[name] = true
					}
				}
			}
		})
	}
	if !expected["APIs"] || !expected["ChatGPT"] {
		return nil, fmt.Errorf("%w: official OpenAI grouping absent", errOfficialFormat)
	}
	return groups, nil
}

// Re-encoding a decoded data object uses the project's JSON codec, just like
// reading a whole JSON publication. No JavaScript from a page is evaluated.
func officialDecodeObject(value any, target any) error {
	data, err := common.Marshal(value)
	if err != nil {
		return err
	}
	if err := common.Unmarshal(data, target); err != nil {
		return fmt.Errorf("%w: invalid data object", errOfficialFormat)
	}
	return nil
}
