package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupHeaderProfileRuntimeTestDB(t *testing.T) {
	t.Helper()

	previousMainDatabaseType := common.MainDatabaseType()
	previousDB := model.DB

	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.RequestHeaderStrategyState{}))
	model.DB = db

	t.Cleanup(func() {
		common.SetMainDatabaseType(previousMainDatabaseType)
		model.DB = previousDB
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
}

func TestResolveChannelRuntimeHeaderProfileHeadersDisabledStrategyIsNoop(t *testing.T) {
	headers, profileID, err := ResolveChannelRuntimeHeaderProfileHeaders(1, nil)
	require.NoError(t, err)
	require.Nil(t, headers)
	require.Empty(t, profileID)

	headers, profileID, err = ResolveChannelRuntimeHeaderProfileHeaders(1, &dto.HeaderProfileStrategy{
		Enabled:            false,
		Mode:               dto.HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"chrome-macos"},
	})
	require.NoError(t, err)
	require.Nil(t, headers)
	require.Empty(t, profileID)
}

func TestResolveChannelRuntimeHeaderProfileHeadersFixedUsesBuiltinTemplate(t *testing.T) {
	headers, profileID, err := ResolveChannelRuntimeHeaderProfileHeaders(1, &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"chrome-macos"},
	})
	require.NoError(t, err)
	require.Equal(t, "chrome-macos", profileID)
	require.Contains(t, headers["User-Agent"], "Chrome/")
	require.Equal(t, "\"macOS\"", headers["Sec-CH-UA-Platform"])
}

func TestResolveChannelRuntimeHeaderProfileHeadersFixedRequiresExactlyOneProfile(t *testing.T) {
	_, _, err := ResolveChannelRuntimeHeaderProfileHeaders(1, &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"chrome-macos", "codex-cli"},
	})
	require.Error(t, err)
}

func TestResolveChannelRuntimeHeaderProfileHeadersRoundRobinRotatesAcrossCalls(t *testing.T) {
	setupHeaderProfileRuntimeTestDB(t)

	strategy := &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeRoundRobin,
		SelectedProfileIDs: []string{"chrome-macos", "codex-desktop"},
	}

	selected := make([]string, 0, 4)
	for i := 0; i < 4; i++ {
		_, profileID, err := ResolveChannelRuntimeHeaderProfileHeaders(7, strategy)
		require.NoError(t, err)
		selected = append(selected, profileID)
	}

	// The persisted cursor must produce a stable alternating rotation.
	require.Equal(t, []string{"chrome-macos", "codex-desktop", "chrome-macos", "codex-desktop"}, selected)
}

func TestResolveChannelRuntimeHeaderProfileHeadersRoundRobinRejectsInvalidChannel(t *testing.T) {
	setupHeaderProfileRuntimeTestDB(t)

	_, _, err := ResolveChannelRuntimeHeaderProfileHeaders(0, &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeRoundRobin,
		SelectedProfileIDs: []string{"chrome-macos", "codex-desktop"},
	})
	require.Error(t, err)
}

func TestResolveChannelRuntimeHeaderProfileHeadersRandomStaysWithinSelection(t *testing.T) {
	strategy := &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeRandom,
		SelectedProfileIDs: []string{"chrome-macos", "codex-desktop"},
	}

	for i := 0; i < 20; i++ {
		_, profileID, err := ResolveChannelRuntimeHeaderProfileHeaders(3, strategy)
		require.NoError(t, err)
		require.Contains(t, []string{"chrome-macos", "codex-desktop"}, profileID)
	}
}

func TestResolveChannelRuntimeHeaderProfileHeadersDropsUnsafeHeaders(t *testing.T) {
	strategy := &dto.HeaderProfileStrategy{
		Enabled:            true,
		Mode:               dto.HeaderProfileModeFixed,
		SelectedProfileIDs: []string{"custom-unsafe"},
		Profiles: []dto.HeaderProfile{
			{
				ID:    "custom-unsafe",
				Name:  "custom unsafe",
				Scope: dto.HeaderProfileScopeUser,
				Headers: map[string]string{
					"User-Agent":    "custom/1.0",
					"Authorization": "Bearer leaked-token",
					"Host":          "evil.example.com",
					"X-Api-Key":     "leaked-key",
				},
			},
		},
	}

	headers, profileID, err := ResolveChannelRuntimeHeaderProfileHeaders(1, strategy)
	require.NoError(t, err)
	require.Equal(t, "custom-unsafe", profileID)
	require.Equal(t, "custom/1.0", headers["User-Agent"])
	// Credentials and transport-owned headers must never come from a template.
	require.NotContains(t, headers, "Authorization")
	require.NotContains(t, headers, "Host")
	require.NotContains(t, headers, "X-Api-Key")
}

func TestIsRuntimeProfileUnsafeHeader(t *testing.T) {
	for _, name := range []string{"Authorization", "host", "X-API-Key", "content-length", "Sec-Fetch-Mode"} {
		require.Truef(t, IsRuntimeProfileUnsafeHeader(name), "expected %s to be unsafe", name)
	}
	for _, name := range []string{"User-Agent", "Originator", "X-Codex-Window-Id", "Accept-Language"} {
		require.Falsef(t, IsRuntimeProfileUnsafeHeader(name), "expected %s to be allowed", name)
	}
}
