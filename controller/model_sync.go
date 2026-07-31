package controller

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type overwriteField struct {
	ModelName string   `json:"model_name"`
	Fields    []string `json:"fields"`
}

type syncRequest struct {
	Overwrite []overwriteField `json:"overwrite"`
	Locale    string           `json:"locale"`
}

// SyncUpstreamModels applies selected upstream metadata changes. A database
// lease keeps concurrent manual or scheduled syncs from racing.
func SyncUpstreamModels(c *gin.Context) {
	var req syncRequest
	_ = c.ShouldBindJSON(&req)
	overwrite := make([]service.ModelMetadataOverwrite, len(req.Overwrite))
	for i, item := range req.Overwrite {
		overwrite[i] = service.ModelMetadataOverwrite{ModelName: item.ModelName, Fields: item.Fields}
	}
	timeout := common.GetEnvOrDefault("SYNC_HTTP_TIMEOUT_SECONDS", 15)
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	var summary *service.ModelMetadataSummary
	err := service.WithNamedLease(ctx, "model-metadata-sync", fmt.Sprintf("manual-%d", time.Now().UnixNano()), time.Minute, func(leaseCtx context.Context) error {
		var syncErr error
		summary, syncErr = service.SyncModelMetadata(leaseCtx, service.ModelMetadataSyncOptions{Overwrite: overwrite, Locale: req.Locale})
		return syncErr
	})
	if errors.Is(err, service.ErrNamedLeaseBusy) {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "模型元数据同步正在进行，请稍后重试"})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取上游模型失败", "locale": req.Locale})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": summary})
}

// SyncUpstreamPreview returns upstream differences without taking the write lease.
func SyncUpstreamPreview(c *gin.Context) {
	locale := c.Query("locale")
	timeout := common.GetEnvOrDefault("SYNC_HTTP_TIMEOUT_SECONDS", 15)
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	preview, err := service.PreviewModelMetadata(ctx, locale)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取上游模型失败", "locale": locale})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": preview})
}
