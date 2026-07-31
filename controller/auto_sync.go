package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type autoPriceSyncConfigRequest struct {
	Enabled *bool                            `json:"enabled"`
	Source  *service.PricingSourceDescriptor `json:"source,omitempty"`
}

type autoModelSyncConfigRequest struct {
	Enabled *bool `json:"enabled"`
}

func GetAutoPriceSyncStatus(c *gin.Context) {
	status, err := service.GetAutoPriceSyncStatus()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

func UpdateAutoPriceSyncConfig(c *gin.Context) {
	request := autoPriceSyncConfigRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid auto price sync configuration"})
		return
	}
	if err := service.UpdateAutoPriceSyncConfig(*request.Enabled, request.Source); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": service.SanitizePricingError(err)})
		return
	}
	recordManageAudit(c, "auto_sync.price_config_update", map[string]interface{}{"enabled": *request.Enabled, "source_changed": request.Source != nil})
	status, err := service.GetAutoPriceSyncStatus()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

func GetAutoModelSyncStatus(c *gin.Context) {
	status, err := service.GetAutoModelSyncStatus()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}

func UpdateAutoModelSyncConfig(c *gin.Context) {
	request := autoModelSyncConfigRequest{}
	if err := c.ShouldBindJSON(&request); err != nil || request.Enabled == nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid auto model sync configuration"})
		return
	}
	if err := service.UpdateAutoModelSyncConfig(*request.Enabled); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "auto_sync.model_config_update", map[string]interface{}{"enabled": *request.Enabled})
	status, err := service.GetAutoModelSyncStatus()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": status})
}
