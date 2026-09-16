package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetOfficialStatus(c *gin.Context) {
	days, err := strconv.Atoi(c.DefaultQuery("days", "90"))
	if err != nil || (days != 30 && days != 90) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "days must be 30 or 90"})
		return
	}
	result, err := service.GetOfficialStatus(c.Request.Context(), days)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Official status is temporarily unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
