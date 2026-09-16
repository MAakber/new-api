package service

import (
	"encoding/xml"
	"fmt"
	"slices"
	"strings"
	"time"
)

type officialXAIProduct struct {
	Name      string                `json:"name"`
	Slug      string                `json:"slug"`
	Incidents []officialXAIIncident `json:"incidents"`
}

type officialXAIIncident struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	Severity  string `json:"severity"`
	StartTime string `json:"startTime"`
	EndTime   string `json:"endTime"`
	Updates   []struct {
		Title       string `json:"title"`
		Description string `json:"description"`
		CreateTime  string `json:"createTime"`
		Severity    string `json:"severity"`
	} `json:"updates"`
}

func (f *officialFetcher) xai(p *OfficialProvider) error {
	products := []struct{ slug, kind string }{
		{"grok-com", "chat"}, {"ios-app", "chat"}, {"android-app", "chat"},
		{"api-us-east-1", "api"}, {"api-us-west-2", "api"}, {"api-eu-west-1", "api"},
	}
	cutoff := officialDayStart(f.now).AddDate(0, 0, -89)
	seen := map[string]bool{}
	for _, spec := range products {
		body, err := f.get(p.URL+"/"+spec.slug+".txt", nil)
		if err != nil {
			return err
		}
		product, err := officialParseXAIProduct(body, spec.slug)
		if err != nil {
			return err
		}
		component := OfficialComponent{ID: spec.slug, Name: product.Name, Status: OfficialOperational}
		coverage := f.now
		for _, raw := range product.Incidents {
			event, current, err := officialParseXAIIncident(raw, spec.slug, p.URL)
			if err != nil {
				return err
			}
			if event.StartAt.Before(coverage) {
				coverage = event.StartAt
			}
			component.Status = officialWorst(component.Status, current)
			p.Incidents = append(p.Incidents, event)
			seen[raw.ID] = true
		}
		coverage = officialDayStart(coverage).AddDate(0, 0, 1)
		reason := "limited_history"
		if !coverage.After(cutoff) {
			coverage, reason = cutoff, ""
		}
		p.Services = append(p.Services, OfficialService{ID: spec.slug, Name: product.Name, Kind: spec.kind, URL: p.URL + "/" + spec.slug, Components: []OfficialComponent{component}, Coverage: OfficialCoverage{From: &coverage, To: &f.now, Reason: reason}})
	}
	// The RSS feed also carries announcements for ancillary products. Preserve
	// their original scope at provider level, without assigning them to all APIs.
	body, err := f.get(p.URL+"/feed.xml", nil)
	if err != nil {
		return err
	}
	var feed struct {
		Channel struct {
			Links []string `xml:"link"`
			Items []struct {
				ID         string   `xml:"guid"`
				Title      string   `xml:"title"`
				URL        string   `xml:"link"`
				Body       string   `xml:"description"`
				Published  string   `xml:"pubDate"`
				Categories []string `xml:"category"`
			} `xml:"item"`
		} `xml:"channel"`
	}
	if err := xml.Unmarshal(body, &feed); err != nil {
		return fmt.Errorf("%w: xAI RSS: %v", errOfficialFormat, err)
	}
	if !slices.Contains(feed.Channel.Links, p.URL) {
		return fmt.Errorf("%w: xAI RSS identity", errOfficialFormat)
	}
	for _, item := range feed.Channel.Items {
		if seen[item.ID] {
			continue
		}
		start, err := time.Parse(time.RFC1123Z, item.Published)
		if err != nil {
			start, err = time.Parse(time.RFC1123, item.Published)
		}
		if err != nil {
			return fmt.Errorf("%w: RSS date", errOfficialFormat)
		}
		if start.Before(cutoff) {
			continue
		}
		state, impact := "unknown", OfficialUnknown
		for _, category := range item.Categories {
			switch category {
			case "resolved", "investigating", "identified", "monitoring":
				state = category
			default:
				if parsed, err := officialState(category); err == nil && parsed != OfficialOperational {
					impact = parsed
				}
			}
		}
		event := OfficialIncident{ID: item.ID, Title: item.Title, Body: officialPlainHTML(item.Body), URL: officialPublicationURL(item.URL, p.URL), Status: state, Impact: impact, StartAt: start.UTC(), UpdatedAt: start.UTC(), ComponentIDs: []string{}, Impacts: []OfficialImpact{}}
		// RSS omits historical severities and structured recovery times. Its
		// resolved notices are retained as notices, never invented impact spans.
		if state == "resolved" {
			for line := range strings.SplitSeq(event.Body, "\n") {
				if raw, ok := strings.CutPrefix(strings.TrimSpace(line), "Resolved: "); ok {
					end, parseErr := time.Parse(time.RFC1123, raw)
					if parseErr == nil {
						event.EndAt = &end
					}
				}
			}
		}
		p.Incidents = append(p.Incidents, event)
	}
	return nil
}

func officialParseXAIProduct(body []byte, slug string) (officialXAIProduct, error) {
	values, err := officialFlightData(body, false)
	if err != nil {
		return officialXAIProduct{}, err
	}
	var product officialXAIProduct
	for _, value := range values {
		officialWalkData(value, 0, func(record map[string]any) {
			item, ok := record["product"].(map[string]any)
			if !ok || item["slug"] != slug {
				return
			}
			if decodeErr := officialDecodeObject(item, &product); decodeErr != nil {
				err = decodeErr
			}
		})
	}
	if err != nil {
		return product, err
	}
	if product.Slug != slug || product.Name == "" || product.Incidents == nil {
		return product, fmt.Errorf("%w: missing xAI product %s", errOfficialFormat, slug)
	}
	return product, nil
}

func officialParseXAIIncident(raw officialXAIIncident, slug, base string) (OfficialIncident, OfficialState, error) {
	event := OfficialIncident{ID: raw.ID, Title: raw.Title, Status: raw.Status, URL: base + "/" + slug + "/" + raw.ID, ComponentIDs: []string{slug}, Impacts: []OfficialImpact{}}
	if raw.ID == "" || raw.Title == "" {
		return event, OfficialUnknown, errOfficialFormat
	}
	var err error
	event.StartAt, err = officialTime(raw.StartTime)
	if err != nil {
		return event, OfficialUnknown, err
	}
	event.EndAt, err = officialEventEnd(raw.Status, raw.EndTime)
	if err != nil {
		return event, OfficialUnknown, err
	}
	if event.EndAt != nil && event.EndAt.Before(event.StartAt) {
		return event, OfficialUnknown, fmt.Errorf("%w: recovery before incident start", errOfficialFormat)
	}
	current, err := officialState(raw.Severity)
	if err != nil {
		return event, OfficialUnknown, err
	}
	event.UpdatedAt = event.StartAt
	type update struct {
		at    time.Time
		state OfficialState
		body  string
	}
	updates := make([]update, 0, len(raw.Updates))
	for _, rawUpdate := range raw.Updates {
		at, err := officialTime(rawUpdate.CreateTime)
		if err != nil {
			return event, OfficialUnknown, err
		}
		state, err := officialState(rawUpdate.Severity)
		if err != nil {
			return event, OfficialUnknown, err
		}
		updates = append(updates, update{at: at, state: state, body: rawUpdate.Title + "\n" + rawUpdate.Description})
	}
	slices.SortFunc(updates, func(a, b update) int { return a.at.Compare(b.at) })
	event.Impact = OfficialOperational
	for i, update := range updates {
		event.Body, event.UpdatedAt = update.body, update.at
		if update.state == OfficialOperational {
			continue
		}
		from, end := update.at, event.EndAt
		if i == 0 && event.StartAt.Before(from) {
			from = event.StartAt
		}
		if i+1 < len(updates) {
			end = &updates[i+1].at
		}
		if event.EndAt != nil && (end == nil || end.After(*event.EndAt)) {
			end = event.EndAt
		}
		if end != nil && !end.After(from) {
			continue
		}
		event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: event.ComponentIDs, Status: update.state, StartAt: from, EndAt: end})
		event.Impact = officialWorst(event.Impact, update.state)
	}
	if len(event.Impacts) == 0 {
		impact := current
		if impact == OfficialOperational {
			impact = OfficialUnknown
		}
		event.Impact = impact
		event.Impacts = append(event.Impacts, OfficialImpact{ComponentIDs: event.ComponentIDs, Status: impact, StartAt: event.StartAt, EndAt: event.EndAt})
	}
	if event.EndAt != nil {
		current = OfficialOperational
	}
	return event, current, nil
}
