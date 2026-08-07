package setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateAndNormalizeDefaultThemeJSONPreservesCompleteTheme(t *testing.T) {
	input := `{"mode":"dark","preset":"custom","custom_color":"#ABCDEF","font":"serif","radius":"lg","scale":"sm","content_layout":"centered","sidebar_variant":"floating","sidebar_collapsible":"offcanvas","sidebar_open":false,"direction":"rtl"}`

	normalized, err := ValidateAndNormalizeDefaultThemeJSON(input)

	require.NoError(t, err)
	var theme DefaultTheme
	require.NoError(t, common.UnmarshalJsonStr(normalized, &theme))
	assert.Equal(t, DefaultTheme{
		Mode:            "dark",
		Preset:          "custom",
		CustomColor:     "#abcdef",
		Font:            "serif",
		Radius:          "lg",
		Scale:           "sm",
		ContentLayout:   "centered",
		SidebarVariant:  "floating",
		SidebarCollapse: "offcanvas",
		SidebarOpen:     false,
		Direction:       "rtl",
	}, theme)
}

func TestValidateAndNormalizeDefaultThemeJSONRejectsIncompleteTheme(t *testing.T) {
	_, err := ValidateAndNormalizeDefaultThemeJSON(`{"mode":"dark"}`)

	require.Error(t, err)
}
