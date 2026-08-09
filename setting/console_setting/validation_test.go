package console_setting

import (
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateAnnouncementsSupportsLifecycleFields(t *testing.T) {
	valid := `[{
		"content":"maintenance",
		"publishDate":"2026-08-01T00:00:00Z",
		"enabled":true,
		"sortOrder":10,
		"startDate":"2026-08-01T00:00:00Z",
		"endDate":"2026-08-31T23:59:59Z",
		"link":"https://example.com/status"
	}]`
	require.NoError(t, ValidateConsoleSettings(valid, "Announcements"))

	backwardCompatible := `[{"content":"legacy","publishDate":"2026-08-01T00:00:00Z"}]`
	require.NoError(t, ValidateConsoleSettings(backwardCompatible, "Announcements"))
}

func TestValidateAnnouncementsRejectsInvalidLifecycleFields(t *testing.T) {
	longLink := "https://example.com/" + strings.Repeat("a", maxAnnouncementLinkLength)
	tests := []struct {
		name       string
		value      string
		errorMatch string
	}{
		{
			name:       "enabled must be boolean",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","enabled":"true"}]`,
			errorMatch: "启用状态必须是布尔值",
		},
		{
			name:       "sort order must be an integer",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","sortOrder":1.5}]`,
			errorMatch: "排序值必须是",
		},
		{
			name:       "sort order must be bounded",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","sortOrder":2147483648}]`,
			errorMatch: "排序值必须是",
		},
		{
			name:       "start date must be RFC3339",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","startDate":"2026-08-01"}]`,
			errorMatch: "开始日期格式错误",
		},
		{
			name:       "end date must be RFC3339",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","endDate":"not-a-date"}]`,
			errorMatch: "结束日期格式错误",
		},
		{
			name:       "start date cannot be after end date",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","startDate":"2026-08-03T00:00:00Z","endDate":"2026-08-02T00:00:00Z"}]`,
			errorMatch: "开始日期不能晚于结束日期",
		},
		{
			name:       "link must be http or https",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","link":"javascript:alert(1)"}]`,
			errorMatch: "链接必须是有效的HTTP或HTTPS URL",
		},
		{
			name:       "link must be bounded",
			value:      `[{"content":"notice","publishDate":"2026-08-01T00:00:00Z","link":"` + longLink + `"}]`,
			errorMatch: "链接长度不能超过",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := ValidateConsoleSettings(test.value, "Announcements")
			require.Error(t, err)
			assert.Contains(t, err.Error(), test.errorMatch)
		})
	}
}

func TestGetAnnouncementsFiltersAndSortsLifecycleFields(t *testing.T) {
	previousSetting := consoleSetting
	t.Cleanup(func() {
		consoleSetting = previousSetting
	})

	now := time.Now().UTC().Truncate(time.Second)
	announcements := []map[string]interface{}{
		{
			"content":     "legacy",
			"publishDate": now.Add(-30 * time.Minute).Format(time.RFC3339),
		},
		{
			"content":     "high priority older",
			"publishDate": now.Add(-3 * time.Hour).Format(time.RFC3339),
			"sortOrder":   10,
		},
		{
			"content":     "high priority newer",
			"publishDate": now.Add(-1 * time.Hour).Format(time.RFC3339),
			"sortOrder":   10,
		},
		{
			"content":     "active window",
			"publishDate": now.Add(-2 * time.Hour).Format(time.RFC3339),
			"enabled":     true,
			"sortOrder":   5,
			"startDate":   now.Add(-1 * time.Hour).Format(time.RFC3339),
			"endDate":     now.Add(1 * time.Hour).Format(time.RFC3339),
		},
		{
			"content":     "disabled",
			"publishDate": now.Format(time.RFC3339),
			"enabled":     false,
			"sortOrder":   100,
		},
		{
			"content":     "not started",
			"publishDate": now.Format(time.RFC3339),
			"startDate":   now.Add(1 * time.Hour).Format(time.RFC3339),
			"sortOrder":   100,
		},
		{
			"content":     "expired",
			"publishDate": now.Format(time.RFC3339),
			"endDate":     now.Add(-1 * time.Hour).Format(time.RFC3339),
			"sortOrder":   100,
		},
		{
			"content":     "invalid link",
			"publishDate": now.Format(time.RFC3339),
			"link":        "javascript:alert(1)",
		},
		{
			"content":     "invalid sort order",
			"publishDate": now.Format(time.RFC3339),
			"sortOrder":   2147483648,
		},
		{
			"content":     "invalid start date",
			"publishDate": now.Format(time.RFC3339),
			"startDate":   "not-a-date",
		},
		{
			"content":     "invalid publish date",
			"publishDate": "not-a-date",
		},
	}
	data, err := common.Marshal(announcements)
	require.NoError(t, err)
	consoleSetting.Announcements = string(data)

	got := GetAnnouncements()
	require.Len(t, got, 4)

	contents := make([]string, 0, len(got))
	for _, announcement := range got {
		content, ok := announcement["content"].(string)
		require.True(t, ok)
		contents = append(contents, content)
	}
	assert.Equal(t, []string{
		"high priority newer",
		"high priority older",
		"active window",
		"legacy",
	}, contents)
}
