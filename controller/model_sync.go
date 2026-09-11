package controller

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Both the versioned editor and legacy callers share the scheduled sync lease.
func SyncUpstreamModels(c *gin.Context) {
	var request struct {
		Locale        string                           `json:"locale"`
		SourceVersion *string                          `json:"source_version"`
		Selections    []model.MetadataSyncSelection    `json:"selections"`
		Overwrite     []service.ModelMetadataOverwrite `json:"overwrite"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid metadata sync request"})
		return
	}
	versioned := request.SourceVersion != nil || request.Selections != nil
	if versioned && (request.SourceVersion == nil || *request.SourceVersion == "" || len(request.Selections) == 0 || len(request.Selections) > 1000) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Preview and select metadata changes before applying"})
		return
	}
	timeout := common.GetEnvOrDefault("SYNC_HTTP_TIMEOUT_SECONDS", 15)
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	var legacy *service.ModelMetadataSummary
	var selected *model.MetadataSyncResult
	err := service.WithNamedLease(ctx, "model-metadata-sync", fmt.Sprintf("manual-%d", time.Now().UnixNano()), time.Minute, func(leaseCtx context.Context) error {
		var syncErr error
		if versioned {
			selected, syncErr = service.SyncSelectedModelMetadata(leaseCtx, request.Locale, *request.SourceVersion, request.Selections)
		} else {
			legacy, syncErr = service.SyncModelMetadata(leaseCtx, service.ModelMetadataSyncOptions{Overwrite: request.Overwrite, Locale: request.Locale})
		}
		return syncErr
	})
	if errors.Is(err, service.ErrNamedLeaseBusy) {
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "模型元数据同步正在进行，请稍后重试"})
		return
	}
	if err != nil {
		if !versioned {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "获取上游模型失败", "locale": request.Locale})
			return
		}
		status := http.StatusBadRequest
		if errors.Is(err, model.ErrMetadataSyncConflict) {
			status = http.StatusConflict
		}
		c.JSON(status, gin.H{"success": false, "message": err.Error()})
		return
	}
	if versioned {
		recordManageAudit(c, "model.metadata.sync", map[string]any{"created_models": selected.CreatedModels, "updated_models": selected.UpdatedModels, "created_vendors": selected.CreatedVendors})
		common.ApiSuccess(c, selected)
		return
	}
	recordManageAudit(c, "model.metadata.sync", map[string]any{"created_models": legacy.CreatedModels, "updated_models": legacy.UpdatedModels, "created_vendors": legacy.CreatedVendors})
	common.ApiSuccess(c, legacy)
}

// Preview does not acquire a write lease or persist any metadata.
func SyncUpstreamPreview(c *gin.Context) {
	timeout := common.GetEnvOrDefault("SYNC_HTTP_TIMEOUT_SECONDS", 15)
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(timeout)*time.Second)
	defer cancel()
	preview, err := service.PreviewModelMetadataCatalog(ctx, c.Query("locale"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, preview)
}
