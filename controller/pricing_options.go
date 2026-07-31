package controller

import (
	"errors"
	"net/http"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

const maxPricingPatchOperations = 10000

type pricingPatchRequest struct {
	Operations []service.PricingPatchOperation `json:"operations"`
}

// PatchPricingOptions is Root-only through the /option router group. It never
// puts models, values, or the original request body into the audit record.
func PatchPricingOptions(c *gin.Context) {
	var request pricingPatchRequest
	if err := c.ShouldBindJSON(&request); err != nil || len(request.Operations) == 0 || len(request.Operations) > maxPricingPatchOperations {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid pricing patch request"})
		return
	}
	updated, err := service.PatchPricingOptions(request.Operations)
	if err != nil {
		writePricingPatchError(c, err)
		return
	}
	keys := make([]string, 0, len(request.Operations))
	seen := make(map[string]struct{})
	for _, operation := range request.Operations {
		if _, exists := seen[operation.Key]; !exists {
			seen[operation.Key] = struct{}{}
			keys = append(keys, operation.Key)
		}
	}
	recordManageAudit(c, "option.pricing_patch", map[string]interface{}{"operation_count": len(request.Operations), "keys": keys})
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": updated})
}

func writePricingPatchError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, service.ErrPricingPatchConflict):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "pricing patch conflict"})
	case errors.Is(err, model.ErrPricingOptionIntegrity):
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "pricing option integrity error"})
	case errors.Is(err, service.ErrPricingPatchValidation):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "failed to apply pricing patch"})
	}
}
