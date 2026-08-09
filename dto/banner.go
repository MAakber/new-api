package dto

import (
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

const (
	BannerTypeDefault = "default"
	BannerTypeOngoing = "ongoing"
	BannerTypeSuccess = "success"
	BannerTypeWarning = "warning"
	BannerTypeError   = "error"

	maxBannerContentLength = 500
	maxBannerExtraLength   = 200
	maxBannerLinkLength    = 500
)

var validBannerTypes = map[string]struct{}{
	BannerTypeDefault: {},
	BannerTypeOngoing: {},
	BannerTypeSuccess: {},
	BannerTypeWarning: {},
	BannerTypeError:   {},
}

// Banner is the public/admin JSON representation of a banner. Database epoch
// values are intentionally converted to RFC3339 strings at the API boundary.
type Banner struct {
	Id          int    `json:"id"`
	Content     string `json:"content"`
	PublishDate string `json:"publishDate"`
	Type        string `json:"type"`
	Extra       string `json:"extra"`
	Enabled     bool   `json:"enabled"`
	SortOrder   int32  `json:"sortOrder"`
	StartDate   string `json:"startDate"`
	EndDate     string `json:"endDate"`
	Link        string `json:"link"`
}

// BannerRequest uses pointers for optional scalar values so false and zero
// remain distinguishable from omitted fields during updates. The unexported
// presence map additionally distinguishes null/empty optional values from an
// omitted field.
type BannerRequest struct {
	Content     *string `json:"content"`
	PublishDate *string `json:"publishDate"`
	Type        *string `json:"type"`
	Extra       *string `json:"extra"`
	Enabled     *bool   `json:"enabled"`
	SortOrder   *int32  `json:"sortOrder"`
	StartDate   *string `json:"startDate"`
	EndDate     *string `json:"endDate"`
	Link        *string `json:"link"`

	present map[string]bool
}

// BannerValues is the validated, storage-oriented form shared by the DTO and
// controller packages without coupling this DTO package to model's larger
// dependency graph.
type BannerValues struct {
	Content     string
	PublishDate int64
	Type        string
	Extra       string
	Enabled     bool
	SortOrder   int32
	StartDate   int64
	EndDate     int64
	Link        string
}

// UnmarshalJSON records which fields were sent without performing JSON
// decoding outside the project's common JSON wrapper.
func (r *BannerRequest) UnmarshalJSON(data []byte) error {
	type bannerRequestAlias BannerRequest
	var decoded bannerRequestAlias
	if err := common.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var fields map[string]any
	if err := common.Unmarshal(data, &fields); err != nil {
		return err
	}
	*r = BannerRequest(decoded)
	r.present = make(map[string]bool, len(fields))
	for field := range fields {
		r.present[field] = true
	}
	return nil
}

func (r *BannerRequest) has(field string, value any) bool {
	if r.present != nil {
		return r.present[field]
	}
	return value != nil
}

func parseBannerDate(value *string, present bool, field string) (int64, error) {
	if !present || value == nil || strings.TrimSpace(*value) == "" {
		return 0, nil
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*value))
	if err != nil {
		return 0, fmt.Errorf("%s must be an RFC3339 timestamp", field)
	}
	return parsed.Unix(), nil
}

func parseRequiredBannerDate(value *string, present bool, field string) (int64, error) {
	if !present || value == nil || strings.TrimSpace(*value) == "" {
		return 0, fmt.Errorf("%s is required", field)
	}
	parsed, err := time.Parse(time.RFC3339, strings.TrimSpace(*value))
	if err != nil {
		return 0, fmt.Errorf("%s must be an RFC3339 timestamp", field)
	}
	return parsed.Unix(), nil
}

func bannerType(value *string, present bool) string {
	if !present || value == nil {
		return BannerTypeDefault
	}
	return strings.TrimSpace(*value)
}

func bannerExtra(value *string, present bool) string {
	if !present || value == nil {
		return ""
	}
	return *value
}

func bannerLink(value *string, present bool) string {
	if !present || value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func bannerEnabled(value *bool, present bool) bool {
	if !present || value == nil {
		return true
	}
	return *value
}

func bannerSortOrder(value *int32, present bool) int32 {
	if !present || value == nil {
		return 0
	}
	return *value
}

func validateBannerValues(value BannerValues) error {
	if utf8.RuneCountInString(strings.TrimSpace(value.Content)) == 0 {
		return errors.New("banner content is required")
	}
	if utf8.RuneCountInString(value.Content) > maxBannerContentLength {
		return fmt.Errorf("banner content must be at most %d characters", maxBannerContentLength)
	}
	if utf8.RuneCountInString(value.Extra) > maxBannerExtraLength {
		return fmt.Errorf("banner extra must be at most %d characters", maxBannerExtraLength)
	}
	if _, ok := validBannerTypes[value.Type]; !ok {
		return fmt.Errorf("invalid banner type: %s", value.Type)
	}
	if value.PublishDate == 0 {
		return errors.New("banner publish date is required")
	}
	if value.StartDate != 0 && value.EndDate != 0 && value.StartDate > value.EndDate {
		return errors.New("banner start date cannot be later than end date")
	}
	if utf8.RuneCountInString(value.Link) > maxBannerLinkLength {
		return fmt.Errorf("banner link must be at most %d characters", maxBannerLinkLength)
	}
	if value.Link != "" {
		parsed, err := url.Parse(value.Link)
		if err != nil || parsed.Hostname() == "" ||
			(!strings.EqualFold(parsed.Scheme, "http") && !strings.EqualFold(parsed.Scheme, "https")) {
			return errors.New("banner link must be a valid HTTP or HTTPS URL")
		}
	}
	return nil
}

// ToValues validates and converts a create request.
func (r *BannerRequest) ToValues() (BannerValues, error) {
	if r == nil {
		return BannerValues{}, errors.New("banner request is nil")
	}
	if !r.has("content", r.Content) || r.Content == nil {
		return BannerValues{}, errors.New("content is required")
	}
	publishDate, err := parseRequiredBannerDate(r.PublishDate, r.has("publishDate", r.PublishDate), "publishDate")
	if err != nil {
		return BannerValues{}, err
	}
	startDate, err := parseBannerDate(r.StartDate, r.has("startDate", r.StartDate), "startDate")
	if err != nil {
		return BannerValues{}, err
	}
	endDate, err := parseBannerDate(r.EndDate, r.has("endDate", r.EndDate), "endDate")
	if err != nil {
		return BannerValues{}, err
	}
	banner := BannerValues{
		Content:     *r.Content,
		PublishDate: publishDate,
		Type:        bannerType(r.Type, r.has("type", r.Type)),
		Extra:       bannerExtra(r.Extra, r.has("extra", r.Extra)),
		Enabled:     bannerEnabled(r.Enabled, r.has("enabled", r.Enabled)),
		SortOrder:   bannerSortOrder(r.SortOrder, r.has("sortOrder", r.SortOrder)),
		StartDate:   startDate,
		EndDate:     endDate,
		Link:        bannerLink(r.Link, r.has("link", r.Link)),
	}
	if err := validateBannerValues(banner); err != nil {
		return BannerValues{}, err
	}
	return banner, nil
}

// Apply validates an update against the existing record and returns the
// candidate plus a non-zero-safe GORM update map. Only fields present in the
// request are included, while explicit false, zero, and empty values remain
// present in the map.
func (r *BannerRequest) Apply(existing BannerValues) (BannerValues, map[string]any, error) {
	if r == nil {
		return BannerValues{}, nil, errors.New("banner request is nil")
	}
	updated := existing
	updates := make(map[string]any)

	if r.has("content", r.Content) {
		if r.Content == nil {
			return BannerValues{}, nil, errors.New("content is required")
		}
		updated.Content = *r.Content
		updates["content"] = updated.Content
	}
	if r.has("publishDate", r.PublishDate) {
		value, err := parseRequiredBannerDate(r.PublishDate, true, "publishDate")
		if err != nil {
			return BannerValues{}, nil, err
		}
		updated.PublishDate = value
		updates["publish_date"] = value
	}
	if r.has("type", r.Type) {
		updated.Type = bannerType(r.Type, true)
		updates["type"] = updated.Type
	}
	if r.has("extra", r.Extra) {
		updated.Extra = bannerExtra(r.Extra, true)
		updates["extra"] = updated.Extra
	}
	if r.has("enabled", r.Enabled) {
		updated.Enabled = bannerEnabled(r.Enabled, true)
		updates["enabled"] = updated.Enabled
	}
	if r.has("sortOrder", r.SortOrder) {
		updated.SortOrder = bannerSortOrder(r.SortOrder, true)
		updates["sort_order"] = updated.SortOrder
	}
	if r.has("startDate", r.StartDate) {
		value, err := parseBannerDate(r.StartDate, true, "startDate")
		if err != nil {
			return BannerValues{}, nil, err
		}
		updated.StartDate = value
		updates["start_date"] = value
	}
	if r.has("endDate", r.EndDate) {
		value, err := parseBannerDate(r.EndDate, true, "endDate")
		if err != nil {
			return BannerValues{}, nil, err
		}
		updated.EndDate = value
		updates["end_date"] = value
	}
	if r.has("link", r.Link) {
		updated.Link = bannerLink(r.Link, true)
		updates["link"] = updated.Link
	}

	if len(updates) == 0 {
		return BannerValues{}, nil, errors.New("banner update is empty")
	}
	if err := validateBannerValues(updated); err != nil {
		return BannerValues{}, nil, err
	}
	return updated, updates, nil
}

func BannerFromValues(id int, value BannerValues) Banner {
	return Banner{
		Id:          id,
		Content:     value.Content,
		PublishDate: formatBannerDate(value.PublishDate),
		Type:        value.Type,
		Extra:       value.Extra,
		Enabled:     value.Enabled,
		SortOrder:   value.SortOrder,
		StartDate:   formatBannerDate(value.StartDate),
		EndDate:     formatBannerDate(value.EndDate),
		Link:        value.Link,
	}
}

func formatBannerDate(value int64) string {
	if value == 0 {
		return ""
	}
	return time.Unix(value, 0).UTC().Format(time.RFC3339)
}
