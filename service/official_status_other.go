package service

import (
	"fmt"
	"slices"
	"strconv"
	"time"
	_ "time/tzdata" // Publisher-local day boundaries must also work in minimal images.
)

type officialTogetherResource struct {
	ID         string `json:"id"`
	Type       string `json:"type"`
	Attributes struct {
		Name           string `json:"name"`
		PublicName     string `json:"public_name"`
		SectionID      int64  `json:"status_page_section_id"`
		Status         string `json:"status"`
		Title          string `json:"title"`
		ReportType     string `json:"report_type"`
		StartsAt       string `json:"starts_at"`
		EndsAt         string `json:"ends_at"`
		AggregateState string `json:"aggregate_state"`
		Message        string `json:"message"`
		Affected       []struct {
			ID     string `json:"status_page_resource_id"`
			Status string `json:"status"`
		} `json:"affected_resources"`
		History []struct {
			Day         string  `json:"day"`
			Status      string  `json:"status"`
			Downtime    float64 `json:"downtime_duration"`
			Maintenance float64 `json:"maintenance_duration"`
		} `json:"status_history"`
	} `json:"attributes"`
	Relationships struct {
		Updates struct {
			Data []struct {
				ID string `json:"id"`
			} `json:"data"`
		} `json:"status_updates"`
	} `json:"relationships"`
}

func (f *officialFetcher) together(p *OfficialProvider) error {
	var response struct {
		Data struct {
			Attributes struct {
				Timezone string `json:"timezone"`
				Domain   string `json:"custom_domain"`
			} `json:"attributes"`
		} `json:"data"`
		Included []officialTogetherResource `json:"included"`
	}
	if _, err := f.get(p.URL+"/index.json", &response); err != nil {
		return err
	}
	if response.Data.Attributes.Domain != "status.together.ai" || response.Included == nil {
		return errOfficialFormat
	}
	zone := response.Data.Attributes.Timezone
	if zone == "Pacific Time (US & Canada)" {
		zone = "America/Los_Angeles"
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return fmt.Errorf("%w: Together calendar timezone", errOfficialFormat)
	}
	sections, updates := map[string]int{}, map[string]string{}
	cutoff := officialDayStart(f.now).AddDate(0, 0, -89)
	for _, item := range response.Included {
		switch item.Type {
		case "status_page_section":
			kind := "api"
			if item.ID == "231960" {
				kind = "other"
			}
			sections[item.ID] = len(p.Services)
			p.Services = append(p.Services, OfficialService{ID: item.ID, Name: item.Attributes.Name, Kind: kind, URL: p.URL, Components: []OfficialComponent{}, Coverage: OfficialCoverage{From: &cutoff, To: &f.now, Reason: "local_day_history"}})
		case "status_update":
			updates[item.ID] = item.Attributes.Message
		}
	}
	for _, item := range response.Included {
		if item.Type != "status_page_resource" {
			continue
		}
		section, exists := sections[strconv.FormatInt(item.Attributes.SectionID, 10)]
		if !exists || item.ID == "" || item.Attributes.PublicName == "" {
			return errOfficialFormat
		}
		state, err := officialState(item.Attributes.Status)
		if err != nil {
			return err
		}
		service := &p.Services[section]
		service.Components = append(service.Components, OfficialComponent{ID: item.ID, Name: item.Attributes.PublicName, Status: state})
		for _, day := range item.Attributes.History {
			from, err := time.ParseInLocation(time.DateOnly, day.Day, location)
			if err != nil {
				return errOfficialFormat
			}
			state := OfficialUnknown
			switch day.Status {
			case "operational":
				if day.Downtime == 0 && day.Maintenance == 0 {
					state = OfficialOperational
				}
			case "downtime", "recovered", "maintenance", "not_monitored":
			default:
				return fmt.Errorf("%w: Together daily status", errOfficialFormat)
			}
			service.observations = append(service.observations, officialObservation{ComponentID: item.ID, From: from.UTC(), To: from.AddDate(0, 0, 1).UTC(), Status: state})
		}
	}
	for i := range p.Services {
		slices.SortFunc(p.Services[i].observations, func(a, b officialObservation) int { return a.From.Compare(b.From) })
	}
	for _, item := range response.Included {
		if item.Type != "status_report" {
			continue
		}
		a := item.Attributes
		start, err := officialTime(a.StartsAt)
		if err != nil {
			return err
		}
		end, err := officialEventEnd(a.AggregateState, a.EndsAt)
		if err != nil {
			return err
		}
		event := OfficialIncident{ID: item.ID, Title: a.Title, URL: p.URL, Status: a.AggregateState, StartAt: start, EndAt: end, UpdatedAt: start, Impact: OfficialUnknown, ComponentIDs: []string{}, Impacts: []OfficialImpact{}}
		for _, update := range item.Relationships.Updates.Data {
			if body := updates[update.ID]; body != "" {
				event.Body = body
				break
			}
		}
		for _, affected := range a.Affected {
			state, err := officialState(affected.Status)
			if err != nil {
				return err
			}
			if a.ReportType == "maintenance" {
				state = OfficialMaintenance
			}
			if state == OfficialOperational {
				state = OfficialUnknown
			}
			event.ComponentIDs = append(event.ComponentIDs, affected.ID)
			event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: []string{affected.ID}, Status: state, StartAt: start, EndAt: end})
			event.Impact = officialWorst(event.Impact, state)
		}
		p.Incidents = append(p.Incidents, event)
	}
	if len(p.Services) == 0 {
		return errOfficialFormat
	}
	return nil
}

type officialRouterComponent struct {
	ID         string                    `json:"id"`
	Name       string                    `json:"name"`
	Status     string                    `json:"status"`
	Type       string                    `json:"type"`
	Components []officialRouterComponent `json:"components"`
}

type officialRouterIncident struct {
	ID          string                    `json:"id"`
	Title       string                    `json:"title"`
	Description string                    `json:"description"`
	Status      string                    `json:"currentStatus"`
	Published   string                    `json:"publishedDate"`
	Resolved    string                    `json:"resolvedDate"`
	Modified    string                    `json:"lastModifiedAt"`
	Components  []officialRouterComponent `json:"componentsAffected"`
	Timeline    []struct {
		Started    string                    `json:"startedAt"`
		Components []officialRouterComponent `json:"componentsAffected"`
	} `json:"timeline"`
}

func (f *officialFetcher) openrouter(p *OfficialProvider) error {
	var config struct {
		Components   []officialRouterComponent `json:"components"`
		Incidents    []officialRouterIncident  `json:"incidents"`
		Maintenances []officialRouterIncident  `json:"maintenances"`
	}
	if _, err := f.get(p.URL+"/config.json", &config); err != nil {
		return err
	}
	if len(config.Components) == 0 || config.Incidents == nil {
		return errOfficialFormat
	}
	for _, group := range config.Components {
		kind := "other"
		if group.ID == "62d944d3-1acb-471b-81a0-099b3da0164f" {
			kind = "api"
		}
		s := OfficialService{ID: group.ID, Name: group.Name, Kind: kind, URL: p.URL, Components: []OfficialComponent{}, Coverage: OfficialCoverage{Reason: "limited_history"}}
		components := group.Components
		if group.Type == "Component" {
			components = []officialRouterComponent{group}
		}
		for _, raw := range components {
			state, err := officialState(raw.Status)
			if err != nil {
				return err
			}
			if raw.ID == "" || raw.Name == "" {
				return errOfficialFormat
			}
			s.Components = append(s.Components, OfficialComponent{ID: raw.ID, Name: raw.Name, Status: state})
		}
		if len(s.Components) == 0 {
			return errOfficialFormat
		}
		p.Services = append(p.Services, s)
	}
	// config.json has no history pagination/coverage contract. Show the exact
	// supplied incidents; absence of an incident cannot turn a date green.
	for _, raw := range append(config.Incidents, config.Maintenances...) {
		start, err := officialTime(raw.Published)
		if err != nil {
			return err
		}
		end, err := officialEventEnd(raw.Status, raw.Resolved)
		if err != nil {
			return err
		}
		event := OfficialIncident{ID: raw.ID, Title: raw.Title, Body: raw.Description, URL: p.URL, Status: raw.Status, StartAt: start, EndAt: end, UpdatedAt: start, Impact: OfficialUnknown, ComponentIDs: []string{}, Impacts: []OfficialImpact{}}
		if raw.Modified != "" {
			event.UpdatedAt, err = officialTime(raw.Modified)
			if err != nil {
				return err
			}
		}
		for _, c := range raw.Components {
			event.ComponentIDs = append(event.ComponentIDs, c.ID)
		}
		slices.SortFunc(raw.Timeline, func(a, b struct {
			Started    string                    `json:"startedAt"`
			Components []officialRouterComponent `json:"componentsAffected"`
		}) int {
			ta, _ := officialTime(a.Started)
			tb, _ := officialTime(b.Started)
			return ta.Compare(tb)
		})
		for i, update := range raw.Timeline {
			at, err := officialTime(update.Started)
			if err != nil {
				return err
			}
			until := end
			if i+1 < len(raw.Timeline) {
				next, err := officialTime(raw.Timeline[i+1].Started)
				if err != nil {
					return err
				}
				until = &next
			}
			for _, c := range update.Components {
				state, err := officialState(c.Status)
				if err != nil {
					return err
				}
				if state == OfficialOperational {
					continue
				}
				event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: []string{c.ID}, Status: state, StartAt: at, EndAt: until})
				event.Impact = officialWorst(event.Impact, state)
			}
		}
		if len(event.Impacts) == 0 {
			event.Impacts = []OfficialImpact{{ComponentIDs: event.ComponentIDs, Status: OfficialUnknown, StartAt: start, EndAt: end}}
		}
		p.Incidents = append(p.Incidents, event)
	}
	return nil
}

func (f *officialFetcher) google(p *OfficialProvider) error {
	var items []struct {
		ID          string `json:"id"`
		Begin       string `json:"begin"`
		End         string `json:"end"`
		Modified    string `json:"modified"`
		Description string `json:"external_desc"`
		Name        string `json:"service_name"`
		Key         string `json:"service_key"`
		Impact      string `json:"status_impact"`
		URI         string `json:"uri"`
		Affected    []struct {
			ID string `json:"id"`
		} `json:"affected_products"`
	}
	if _, err := f.get(p.URL+"incidents.json", &items); err != nil {
		return err
	}
	if items == nil {
		return errOfficialFormat
	}
	const gemini = "npdyhgECDJ6tB66MxXyo"
	component := OfficialComponent{ID: gemini, Name: "Gemini Web & App", Status: OfficialOperational}
	earliest, found := f.now, false
	for _, raw := range items {
		start, err := officialTime(raw.Begin)
		if err != nil {
			return err
		}
		if start.Before(earliest) {
			earliest = start
		}
		if raw.Key != gemini && !slices.ContainsFunc(raw.Affected, func(product struct {
			ID string `json:"id"`
		}) bool {
			return product.ID == gemini
		}) {
			continue
		}
		found = true
		event := OfficialIncident{ID: raw.ID, Title: raw.Name, Body: raw.Description, URL: officialPublicationURL(raw.URI, p.URL), StartAt: start, Status: "investigating", Impact: OfficialUnknown, ComponentIDs: []string{gemini}, Impacts: []OfficialImpact{}}
		event.UpdatedAt, err = officialTime(raw.Modified)
		if err != nil {
			return err
		}
		switch raw.Impact {
		case "SERVICE_DISRUPTION":
			event.Impact = OfficialPartial
		case "SERVICE_OUTAGE":
			event.Impact = OfficialMajor
		case "SERVICE_INFORMATION": // A notice does not declare a severity.
		default:
			return fmt.Errorf("%w: Google impact", errOfficialFormat)
		}
		if raw.End != "" {
			end, err := officialTime(raw.End)
			if err != nil {
				return err
			}
			event.EndAt, event.Status = &end, "resolved"
		} else {
			component.Status = officialWorst(component.Status, event.Impact)
		}
		event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: event.ComponentIDs, Status: event.Impact, StartAt: start, EndAt: event.EndAt})
		p.Incidents = append(p.Incidents, event)
	}
	if !found {
		return fmt.Errorf("%w: Gemini product absent", errOfficialFormat)
	}
	coverage := officialDayStart(earliest).AddDate(0, 0, 1)
	p.Services = []OfficialService{
		{ID: "developer-api", Name: "Gemini Developer API", Kind: "api", URL: "https://aistudio.google.com", Components: []OfficialComponent{}, Coverage: OfficialCoverage{Reason: "unverified_source"}},
		{ID: "chat", Name: "Gemini Web & App", Kind: "chat", URL: p.URL, Components: []OfficialComponent{component}, Coverage: OfficialCoverage{From: &coverage, To: &f.now}},
	}
	return nil
}
