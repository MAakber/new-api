package service

import (
	"fmt"
	"slices"
	"strconv"
	"time"
)

const officialDeepSeekAPI = "https://statuspage.flashduty.com/api/status-page/6410630422455"

type officialFlashComponent struct {
	ID        string `json:"component_id"`
	SectionID string `json:"section_id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Since     int64  `json:"available_since_seconds"`
}

type officialFlashChange struct {
	ID          int64                    `json:"change_id"`
	Title       string                   `json:"title"`
	Description string                   `json:"description"`
	Status      string                   `json:"status"`
	Start       int64                    `json:"start_at_seconds"`
	End         int64                    `json:"close_at_seconds"`
	Components  []officialFlashComponent `json:"affected_components"`
	Updates     []struct {
		At          int64                    `json:"at_seconds"`
		Description string                   `json:"description"`
		Changes     []officialFlashComponent `json:"component_changes"`
	} `json:"updates"`
}

type officialFlashStructure struct {
	Data struct {
		Impacts []struct {
			ComponentID string `json:"component_id"`
			ChangeID    int64  `json:"change_id"`
			Start       int64  `json:"start_at_seconds"`
			End         int64  `json:"end_at_seconds"`
			Status      string `json:"status"`
		} `json:"component_impacts"`
		SectionImpacts []struct {
			SectionID string `json:"section_id"`
			ChangeID  int64  `json:"change_id"`
			Start     int64  `json:"start_at_seconds"`
			End       int64  `json:"end_at_seconds"`
			Status    string `json:"status"`
		} `json:"section_impacts"`
		Uptimes []struct {
			ComponentID string   `json:"component_id"`
			Uptime      *float64 `json:"uptime"`
			Since       int64    `json:"available_since_seconds"`
		} `json:"component_uptimes"`
		Linked []struct {
			ID    int64  `json:"id"`
			Title string `json:"title"`
		} `json:"linked_changes"`
	} `json:"data"`
}

func (f *officialFetcher) deepseek(p *OfficialProvider) error {
	var active struct {
		Data struct {
			Page struct {
				ID         int64                    `json:"page_id"`
				Domain     string                   `json:"custom_domain"`
				Components []officialFlashComponent `json:"components"`
			} `json:"page"`
			Changes []officialFlashChange `json:"active_changes"`
		} `json:"data"`
	}
	if _, err := f.get(officialDeepSeekAPI+"/summary/active", &active); err != nil {
		return err
	}
	if active.Data.Page.ID != 6410630422455 || active.Data.Page.Domain != "status.deepseek.com" || active.Data.Changes == nil {
		return fmt.Errorf("%w: DeepSeek official page identity/active changes", errOfficialFormat)
	}
	apiIDs := []string{"01KY4MVS8BM3F9JSYWACGQVG7A", "01KY4MVS8BSBSVW6053QJ37RJE"}
	const chatSection = "01KY4ND2MQAQKEAGJKTNGREKBR"
	cutoff := officialDayStart(f.now).AddDate(0, 0, -89)
	p.Services = []OfficialService{
		{ID: "api", Name: "DeepSeek API", Kind: "api", URL: p.URL, Components: []OfficialComponent{}, Coverage: OfficialCoverage{From: &cutoff, To: &f.now}},
		{ID: "chat", Name: "DeepSeek Chat", Kind: "chat", URL: p.URL, Components: []OfficialComponent{}, Coverage: OfficialCoverage{From: &cutoff, To: &f.now}},
	}
	known := map[string]bool{}
	for _, raw := range active.Data.Page.Components {
		if raw.ID == "" || raw.Name == "" || raw.Since <= 0 {
			return errOfficialFormat
		}
		component := OfficialComponent{ID: raw.ID, Name: raw.Name, Status: OfficialOperational, Since: time.Unix(raw.Since, 0).UTC()}
		index := -1
		if slices.Contains(apiIDs, raw.ID) {
			index = 0
		}
		if raw.SectionID == chatSection {
			index = 1
		}
		if index < 0 {
			return fmt.Errorf("%w: unrecognized DeepSeek component", errOfficialFormat)
		}
		known[raw.ID] = true
		p.Services[index].Components = append(p.Services[index].Components, component)
	}
	if len(p.Services[0].Components) != len(apiIDs) || !known["01KY4ND2PNYT9FY5W4ZH80VGJ4"] {
		return fmt.Errorf("%w: missing DeepSeek API/chat components", errOfficialFormat)
	}

	var changes struct {
		Data struct {
			Items []officialFlashChange `json:"items"`
		} `json:"data"`
	}
	query := "?start_at_seconds=" + strconv.FormatInt(cutoff.Unix(), 10) + "&end_at_seconds=" + strconv.FormatInt(f.now.Unix(), 10)
	if _, err := f.get(officialDeepSeekAPI+"/change/list"+query, &changes); err != nil {
		return err
	}
	if changes.Data.Items == nil {
		return fmt.Errorf("%w: DeepSeek history list missing", errOfficialFormat)
	}
	events := map[int64]int{}
	for _, raw := range append(changes.Data.Items, active.Data.Changes...) {
		if _, exists := events[raw.ID]; exists {
			continue
		}
		event, err := officialParseFlashChange(raw, p.URL)
		if err != nil {
			return err
		}
		events[raw.ID] = len(p.Incidents)
		p.Incidents = append(p.Incidents, event)
	}
	for _, days := range []int{90, 30} {
		start := officialDayStart(f.now).AddDate(0, 0, 1-days)
		query := "?start_at_from_seconds=" + strconv.FormatInt(start.Unix(), 10) + "&start_at_to_seconds=" + strconv.FormatInt(f.now.Unix(), 10)
		var structure officialFlashStructure
		if _, err := f.get(officialDeepSeekAPI+"/summary/structure"+query, &structure); err != nil {
			return err
		}
		if structure.Data.Impacts == nil || structure.Data.SectionImpacts == nil || structure.Data.Uptimes == nil || structure.Data.Linked == nil {
			return fmt.Errorf("%w: DeepSeek history structure missing", errOfficialFormat)
		}
		for _, uptime := range structure.Data.Uptimes {
			if !known[uptime.ComponentID] || uptime.Uptime == nil || *uptime.Uptime < 0 || *uptime.Uptime > 100 {
				return fmt.Errorf("%w: DeepSeek uptime", errOfficialFormat)
			}
			for i := range p.Services {
				for j := range p.Services[i].Components {
					component := &p.Services[i].Components[j]
					if component.ID == uptime.ComponentID {
						// A newly introduced component does not have a full 30/90-day
						// denominator. Do not present its shorter-window percentage.
						if !component.Since.After(start) && uptime.Since <= start.Unix() {
							component.Availability = append(component.Availability, OfficialAvailability{Days: days, Percent: *uptime.Uptime, From: start, To: f.now})
						}
					}
				}
			}
		}
		if days == 30 {
			continue
		}
		// linked_changes makes truncation detectable. If change/list omitted an
		// event that began before the window, retain the official linked title
		// and exact component impact intervals supplied by summary/structure.
		for _, linked := range structure.Data.Linked {
			if _, exists := events[linked.ID]; exists {
				continue
			}
			if linked.ID == 0 || linked.Title == "" {
				return errOfficialFormat
			}
			events[linked.ID] = len(p.Incidents)
			p.Incidents = append(p.Incidents, OfficialIncident{ID: strconv.FormatInt(linked.ID, 10), Title: linked.Title, URL: p.URL, Status: "unknown", Impact: OfficialUnknown, ComponentIDs: []string{}, Impacts: []OfficialImpact{}})
		}
		for _, raw := range structure.Data.Impacts {
			index, exists := events[raw.ChangeID]
			if !exists || !known[raw.ComponentID] || raw.Start <= 0 || (raw.End != 0 && raw.End < raw.Start) {
				return fmt.Errorf("%w: unmatched DeepSeek impact", errOfficialFormat)
			}
			state, err := officialState(raw.Status)
			if err != nil {
				return err
			}
			impact := OfficialImpact{ComponentIDs: []string{raw.ComponentID}, Status: state, StartAt: time.Unix(raw.Start, 0).UTC()}
			if raw.End > 0 {
				end := time.Unix(raw.End, 0).UTC()
				impact.EndAt = &end
			}
			event := &p.Incidents[index]
			event.Impacts = append(event.Impacts, impact)
			event.Impact = officialWorst(event.Impact, state)
			if !slices.Contains(event.ComponentIDs, raw.ComponentID) {
				event.ComponentIDs = append(event.ComponentIDs, raw.ComponentID)
			}
			if event.StartAt.IsZero() || impact.StartAt.Before(event.StartAt) {
				event.StartAt = impact.StartAt
			}
			if event.Status == "unknown" && impact.EndAt != nil {
				if event.EndAt == nil || impact.EndAt.After(*event.EndAt) {
					event.EndAt = impact.EndAt
					event.UpdatedAt = *impact.EndAt
				}
			}
		}
		for _, raw := range structure.Data.SectionImpacts {
			index, exists := events[raw.ChangeID]
			if !exists || raw.SectionID != chatSection || raw.Start <= 0 || (raw.End != 0 && raw.End < raw.Start) {
				return fmt.Errorf("%w: unmatched DeepSeek section impact", errOfficialFormat)
			}
			state, err := officialState(raw.Status)
			if err != nil {
				return err
			}
			impact := OfficialImpact{ComponentIDs: []string{}, ServiceIDs: []string{"chat"}, Status: state, StartAt: time.Unix(raw.Start, 0).UTC()}
			if raw.End > 0 {
				end := time.Unix(raw.End, 0).UTC()
				impact.EndAt = &end
			}
			event := &p.Incidents[index]
			event.Impacts = append(event.Impacts, impact)
			if !slices.Contains(event.ServiceIDs, "chat") {
				event.ServiceIDs = append(event.ServiceIDs, "chat")
			}
			event.Impact = officialWorst(event.Impact, state)
			if event.StartAt.IsZero() || impact.StartAt.Before(event.StartAt) {
				event.StartAt = impact.StartAt
			}
			if event.Status == "unknown" && impact.EndAt != nil && (event.EndAt == nil || impact.EndAt.After(*event.EndAt)) {
				event.EndAt = impact.EndAt
				event.UpdatedAt = *impact.EndAt
			}
		}
	}
	for i := range p.Incidents {
		event := &p.Incidents[i]
		if event.StartAt.IsZero() {
			return fmt.Errorf("%w: missing linked impact", errOfficialFormat)
		}
		if len(event.Impacts) == 0 {
			event.Impacts = []OfficialImpact{{ComponentIDs: event.ComponentIDs, Status: OfficialUnknown, StartAt: event.StartAt, EndAt: event.EndAt}}
		}
	}
	for _, change := range active.Data.Changes {
		for _, raw := range change.Components {
			if !known[raw.ID] {
				return fmt.Errorf("%w: active component missing", errOfficialFormat)
			}
			state, err := officialState(raw.Status)
			if err != nil {
				return err
			}
			for i := range p.Services {
				for j := range p.Services[i].Components {
					component := &p.Services[i].Components[j]
					if component.ID == raw.ID {
						component.Status = officialWorst(component.Status, state)
					}
				}
			}
		}
	}
	return nil
}

func officialParseFlashChange(raw officialFlashChange, base string) (OfficialIncident, error) {
	event := OfficialIncident{ID: strconv.FormatInt(raw.ID, 10), Title: raw.Title, Body: raw.Description, URL: base, Status: raw.Status, Impact: OfficialUnknown, ComponentIDs: []string{}, Impacts: []OfficialImpact{}}
	if raw.ID <= 0 || raw.Start <= 0 || raw.Title == "" {
		return event, errOfficialFormat
	}
	event.StartAt, event.UpdatedAt = time.Unix(raw.Start, 0).UTC(), time.Unix(raw.Start, 0).UTC()
	end := ""
	if raw.End > 0 {
		end = time.Unix(raw.End, 0).UTC().Format(time.RFC3339)
	}
	var err error
	event.EndAt, err = officialEventEnd(raw.Status, end)
	if err != nil {
		return event, err
	}
	if event.EndAt != nil && event.EndAt.Before(event.StartAt) {
		return event, fmt.Errorf("%w: recovery before incident start", errOfficialFormat)
	}
	for _, component := range raw.Components {
		if !slices.Contains(event.ComponentIDs, component.ID) {
			event.ComponentIDs = append(event.ComponentIDs, component.ID)
		}
	}
	for _, update := range raw.Updates {
		when := time.Unix(update.At, 0).UTC()
		if when.After(event.UpdatedAt) {
			event.UpdatedAt = when
			event.Body = update.Description
		}
	}
	return event, nil
}
