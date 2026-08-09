package dto

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func decodeBannerRequest(t *testing.T, value string) BannerRequest {
	t.Helper()
	var request BannerRequest
	require.NoError(t, common.UnmarshalJsonStr(value, &request))
	return request
}

func TestBannerRequestValidatesAndAppliesDefaults(t *testing.T) {
	request := decodeBannerRequest(t, `{
		"content":"maintenance",
		"publishDate":"2026-08-09T00:00:00Z",
		"enabled":false,
		"sortOrder":0
	}`)

	values, err := request.ToValues()
	require.NoError(t, err)
	assert.Equal(t, BannerTypeDefault, values.Type)
	assert.False(t, values.Enabled)
	assert.Zero(t, values.SortOrder)
	assert.Empty(t, values.StartDate)

	tooLongContent := decodeBannerRequest(t, `{"content":"`+strings.Repeat("a", 501)+`","publishDate":"2026-08-09T00:00:00Z"}`)
	_, err = tooLongContent.ToValues()
	assert.Error(t, err)
	emptyContent := decodeBannerRequest(t, `{"content":"   ","publishDate":"2026-08-09T00:00:00Z"}`)
	_, err = emptyContent.ToValues()
	assert.Error(t, err)

	invalidLink := decodeBannerRequest(t, `{"content":"notice","publishDate":"2026-08-09T00:00:00Z","link":"javascript:alert(1)"}`)
	_, err = invalidLink.ToValues()
	assert.Error(t, err)
	tooLongLink := decodeBannerRequest(t, `{"content":"notice","publishDate":"2026-08-09T00:00:00Z","link":"https://example.com/`+strings.Repeat("a", 500)+`"}`)
	_, err = tooLongLink.ToValues()
	assert.Error(t, err)
}

func TestBannerRequestRejectsInvalidLifecycleValues(t *testing.T) {
	cases := []string{
		`{"content":"notice","publishDate":"not-a-date"}`,
		`{"content":"notice","publishDate":"2026-08-09T00:00:00Z","type":"unknown"}`,
		`{"content":"notice","publishDate":"2026-08-09T00:00:00Z","extra":"` + strings.Repeat("x", 201) + `"}`,
		`{"content":"notice","publishDate":"2026-08-09T00:00:00Z","startDate":"2026-08-10T00:00:00Z","endDate":"2026-08-09T00:00:00Z"}`,
	}
	for _, value := range cases {
		request := decodeBannerRequest(t, value)
		_, err := request.ToValues()
		assert.Error(t, err, value)
	}
}

func TestBannerRequestUpdatePreservesExplicitZeroFalseAndEmptyValues(t *testing.T) {
	request := decodeBannerRequest(t, `{
		"enabled":false,
		"sortOrder":0,
		"extra":"",
		"startDate":"",
		"endDate":null,
		"link":""
	}`)
	existing := BannerValues{
		Content:     "notice",
		PublishDate: 1_000,
		Type:        BannerTypeWarning,
		Extra:       "old extra",
		Enabled:     true,
		SortOrder:   9,
		StartDate:   2_000,
		EndDate:     3_000,
		Link:        "https://old.example.com",
	}

	updated, updates, err := request.Apply(existing)
	require.NoError(t, err)
	assert.False(t, updated.Enabled)
	assert.Zero(t, updated.SortOrder)
	assert.Empty(t, updated.Extra)
	assert.Zero(t, updated.StartDate)
	assert.Zero(t, updated.EndDate)
	assert.Empty(t, updated.Link)
	assert.Equal(t, false, updates["enabled"])
	assert.Equal(t, int32(0), updates["sort_order"])
	assert.Equal(t, "", updates["extra"])
	assert.Equal(t, int64(0), updates["start_date"])
	assert.Equal(t, int64(0), updates["end_date"])
	assert.Equal(t, "", updates["link"])
}
