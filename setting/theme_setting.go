package setting

import (
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const DefaultThemeOptionKey = "theme.default"

var (
	defaultThemeModes = map[string]struct{}{
		"dark": {}, "light": {}, "system": {},
	}
	defaultThemePresets = map[string]struct{}{
		"default": {}, "anthropic": {}, "simple-large": {}, "underground": {},
		"rose-garden": {}, "lake-view": {}, "sunset-glow": {}, "forest-whisper": {},
		"ocean-breeze": {}, "lavender-dream": {}, "custom": {},
	}
	defaultThemeFonts = map[string]struct{}{
		"default": {}, "sans": {}, "serif": {},
	}
	defaultThemeRadii = map[string]struct{}{
		"default": {}, "none": {}, "sm": {}, "md": {}, "lg": {}, "xl": {},
	}
	defaultThemeScales = map[string]struct{}{
		"default": {}, "sm": {}, "lg": {}, "xl": {},
	}
	defaultThemeContentLayouts = map[string]struct{}{
		"full": {}, "centered": {},
	}
	defaultThemeSidebarVariants = map[string]struct{}{
		"inset": {}, "sidebar": {}, "floating": {},
	}
	defaultThemeSidebarCollapsibles = map[string]struct{}{
		"offcanvas": {}, "icon": {}, "none": {},
	}
	defaultThemeDirections = map[string]struct{}{
		"ltr": {}, "rtl": {},
	}
)

type DefaultTheme struct {
	Mode            string `json:"mode"`
	Preset          string `json:"preset"`
	CustomColor     string `json:"custom_color"`
	Font            string `json:"font"`
	Radius          string `json:"radius"`
	Scale           string `json:"scale"`
	ContentLayout   string `json:"content_layout"`
	SidebarVariant  string `json:"sidebar_variant"`
	SidebarCollapse string `json:"sidebar_collapsible"`
	SidebarOpen     bool   `json:"sidebar_open"`
	Direction       string `json:"direction"`
}

var DefaultThemeSettings = DefaultTheme{
	Mode:            "system",
	Preset:          "default",
	CustomColor:     "#6366f1",
	Font:            "default",
	Radius:          "default",
	Scale:           "default",
	ContentLayout:   "full",
	SidebarVariant:  "inset",
	SidebarCollapse: "icon",
	SidebarOpen:     true,
	Direction:       "ltr",
}

var defaultThemeSettings = DefaultThemeSettings

func DefaultThemeSettingsJSONString() string {
	data, err := common.Marshal(defaultThemeSettings)
	if err != nil {
		return "{}"
	}
	return string(data)
}

func ValidateAndNormalizeDefaultThemeJSON(value string) (string, error) {
	var theme DefaultTheme
	if err := common.UnmarshalJsonStr(value, &theme); err != nil {
		return "", fmt.Errorf("invalid default theme: %w", err)
	}
	theme.CustomColor = strings.ToLower(strings.TrimSpace(theme.CustomColor))

	if _, ok := defaultThemeModes[theme.Mode]; !ok {
		return "", fmt.Errorf("invalid default theme mode %q", theme.Mode)
	}
	if _, ok := defaultThemePresets[theme.Preset]; !ok {
		return "", fmt.Errorf("invalid default theme preset %q", theme.Preset)
	}
	if len(theme.CustomColor) != 7 || theme.CustomColor[0] != '#' {
		return "", fmt.Errorf("invalid default theme custom color %q", theme.CustomColor)
	}
	for _, char := range theme.CustomColor[1:] {
		if !strings.ContainsRune("0123456789abcdef", char) {
			return "", fmt.Errorf("invalid default theme custom color %q", theme.CustomColor)
		}
	}
	if _, ok := defaultThemeFonts[theme.Font]; !ok {
		return "", fmt.Errorf("invalid default theme font %q", theme.Font)
	}
	if _, ok := defaultThemeRadii[theme.Radius]; !ok {
		return "", fmt.Errorf("invalid default theme radius %q", theme.Radius)
	}
	if _, ok := defaultThemeScales[theme.Scale]; !ok {
		return "", fmt.Errorf("invalid default theme scale %q", theme.Scale)
	}
	if _, ok := defaultThemeContentLayouts[theme.ContentLayout]; !ok {
		return "", fmt.Errorf("invalid default theme content layout %q", theme.ContentLayout)
	}
	if _, ok := defaultThemeSidebarVariants[theme.SidebarVariant]; !ok {
		return "", fmt.Errorf("invalid default theme sidebar variant %q", theme.SidebarVariant)
	}
	if _, ok := defaultThemeSidebarCollapsibles[theme.SidebarCollapse]; !ok {
		return "", fmt.Errorf("invalid default theme sidebar collapsible %q", theme.SidebarCollapse)
	}
	if _, ok := defaultThemeDirections[theme.Direction]; !ok {
		return "", fmt.Errorf("invalid default theme direction %q", theme.Direction)
	}

	data, err := common.Marshal(theme)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func SetDefaultThemeSettings(value string) error {
	normalized, err := ValidateAndNormalizeDefaultThemeJSON(value)
	if err != nil {
		return err
	}
	return common.UnmarshalJsonStr(normalized, &defaultThemeSettings)
}

func GetDefaultThemeSettings() DefaultTheme {
	return defaultThemeSettings
}
