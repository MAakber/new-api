package controller

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func GetMCPServers(c *gin.Context) {
	servers, err := model.ListMCPServers()
	if err != nil {
		writeMCPError(c, err)
		return
	}
	views := make([]service.MCPServerConfig, 0, len(servers))
	for _, server := range servers {
		view, err := service.MCPServerView(server)
		if err != nil {
			writeMCPError(c, err)
			return
		}
		views = append(views, view)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": views})
}

func SaveMCPServer(c *gin.Context) {
	var input service.MCPServerConfig
	if !decodeMCPInput(c, &input) {
		return
	}
	var previous *model.MCPServer
	if c.Param("id") != "" {
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			writeMCPError(c, service.ErrMCPConfiguration)
			return
		}
		previous, err = model.GetMCPServer(id)
		if err != nil {
			writeMCPError(c, err)
			return
		}
		input.ID = id
	} else {
		input.ID = 0
		servers, err := model.ListMCPServers()
		if err != nil {
			writeMCPError(c, err)
			return
		}
		if len(servers) >= service.MaxMCPServers {
			writeMCPError(c, service.ErrMCPConfiguration)
			return
		}
	}
	server, err := service.PrepareMCPServer(input, previous)
	if err != nil {
		writeMCPError(c, err)
		return
	}
	if err := model.SaveMCPServer(server); err != nil {
		writeMCPError(c, err)
		return
	}
	service.InvalidateMCPServer(server.ID)
	recordManageAudit(c, "mcp.save", map[string]any{"server_id": server.ID, "enabled": server.Enabled, "revision": server.Revision})
	view, err := service.MCPServerView(*server)
	if err != nil {
		writeMCPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

func DeleteMCPServer(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		writeMCPError(c, service.ErrMCPConfiguration)
		return
	}
	var input struct {
		Revision int64 `json:"revision"`
	}
	if !decodeMCPInput(c, &input) {
		return
	}
	if err := model.DeleteMCPServer(id, input.Revision); err != nil {
		writeMCPError(c, err)
		return
	}
	service.InvalidateMCPServer(id)
	recordManageAudit(c, "mcp.delete", map[string]any{"server_id": id})
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func TestMCPServer(c *gin.Context) {
	var input service.MCPServerConfig
	if !decodeMCPInput(c, &input) {
		return
	}
	var previous *model.MCPServer
	if input.ID > 0 {
		var err error
		previous, err = model.GetMCPServer(input.ID)
		if err != nil {
			writeMCPError(c, err)
			return
		}
	}
	server, err := service.PrepareMCPServer(input, previous)
	if err != nil {
		writeMCPError(c, err)
		return
	}
	tools, err := service.TestMCPConnection(c.Request.Context(), *server)
	if err != nil {
		writeMCPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": tools})
}

func GetAvailableMCPTools(c *gin.Context) {
	tools, err := service.ListAvailableMCPTools(c.GetString("user_group"))
	if err != nil {
		writeMCPError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": tools})
}

func decodeMCPInput(c *gin.Context, input any) bool {
	if c.ContentType() != "application/json" {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"success": false, "message": "MCP settings require application/json"})
		return false
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 512*1024)
	if err := common.DecodeJson(c.Request.Body, input); err != nil {
		writeMCPError(c, service.ErrMCPConfiguration)
		return false
	}
	return true
}

func writeMCPError(c *gin.Context, err error) {
	status, message := http.StatusBadGateway, "MCP operation failed; check the service configuration"
	switch {
	case errors.Is(err, service.ErrMCPConfiguration):
		status, message = http.StatusBadRequest, err.Error()
	case errors.Is(err, model.ErrMCPServerConflict):
		status, message = http.StatusConflict, err.Error()
	case errors.Is(err, gorm.ErrRecordNotFound):
		status, message = http.StatusNotFound, "MCP service was not found"
	}
	c.JSON(status, gin.H{"success": false, "message": message})
}
