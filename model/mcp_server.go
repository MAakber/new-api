package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
)

var ErrMCPServerConflict = errors.New("MCP configuration changed; reload before saving")

// MCPServer keeps operator-managed connections separate from public options.
// Structured configuration uses TEXT on every supported database dialect.
type MCPServer struct {
	ID                   int    `json:"id" gorm:"primaryKey"`
	Name                 string `json:"name" gorm:"type:varchar(100)"`
	URL                  string `json:"url" gorm:"type:text"`
	Enabled              bool   `json:"enabled"`
	GroupsJSON           string `json:"-" gorm:"type:text"`
	ToolsJSON            string `json:"-" gorm:"type:text"`
	EncryptedCredentials string `json:"-" gorm:"type:text"`
	TimeoutSeconds       int    `json:"timeout_seconds"`
	MaxConcurrency       int    `json:"max_concurrency"`
	Revision             int64  `json:"revision"`
	CreatedAt            int64  `json:"created_at"`
	UpdatedAt            int64  `json:"updated_at"`
}

func ListMCPServers() ([]MCPServer, error) {
	servers := make([]MCPServer, 0)
	err := DB.Order("id ASC").Find(&servers).Error
	return servers, err
}

func GetMCPServer(id int) (*MCPServer, error) {
	var server MCPServer
	err := DB.First(&server, id).Error
	return &server, err
}

func SaveMCPServer(server *MCPServer) error {
	server.UpdatedAt = common.GetTimestamp()
	if server.ID == 0 {
		server.Revision = 1
		server.CreatedAt = server.UpdatedAt
		return DB.Create(server).Error
	}
	result := DB.Model(&MCPServer{}).
		Where("id = ? AND revision = ?", server.ID, server.Revision).
		Updates(map[string]any{
			"name": server.Name, "url": server.URL, "enabled": server.Enabled,
			"groups_json": server.GroupsJSON, "tools_json": server.ToolsJSON,
			"encrypted_credentials": server.EncryptedCredentials,
			"timeout_seconds":       server.TimeoutSeconds, "max_concurrency": server.MaxConcurrency,
			"revision": server.Revision + 1, "updated_at": server.UpdatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrMCPServerConflict
	}
	server.Revision++
	return nil
}

func DeleteMCPServer(id int, revision int64) error {
	result := DB.Where("id = ? AND revision = ?", id, revision).Delete(&MCPServer{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMCPServerConflict
	}
	return nil
}

// CheckMCPServerRevision prevents disabled or edited services from being used
// by an already-running conversation on this or another gateway instance.
func CheckMCPServerRevision(id int, revision int64) error {
	var server MCPServer
	err := DB.Select("id", "revision", "enabled").First(&server, id).Error
	if err != nil {
		return err
	}
	if !server.Enabled || server.Revision != revision {
		return ErrMCPServerConflict
	}
	return nil
}
