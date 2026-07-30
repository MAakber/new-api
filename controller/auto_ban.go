package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type releaseAutoBanRequest struct {
	Reason string `json:"reason"`
}

func GetAutoBanRecords(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	userId, _ := strconv.Atoi(c.Query("user_id"))
	ruleType := strings.TrimSpace(c.Query("rule_type"))
	status := strings.TrimSpace(c.Query("status"))
	records, total, err := model.ListUserAutoBanRecords(model.AutoBanRecordQuery{
		Page:     page,
		PageSize: pageSize,
		UserId:   userId,
		RuleType: ruleType,
		Status:   status,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     records,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func ReleaseAutoBan(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("id"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "invalid user id")
		return
	}
	request := releaseAutoBanRequest{}
	if c.Request.ContentLength != 0 {
		if err := common.DecodeJson(c.Request.Body, &request); err != nil {
			common.ApiErrorMsg(c, "invalid request body")
			return
		}
	}
	if len(strings.TrimSpace(request.Reason)) > 255 {
		common.ApiErrorMsg(c, "release reason is too long")
		return
	}
	changed, err := model.ReleaseUserAutoBan(userId, c.GetInt("id"), request.Reason)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAuditFor(c, userId, "user.auto_ban_release", map[string]interface{}{
		"changed": changed,
		"reason":  strings.TrimSpace(request.Reason),
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"released": changed,
		},
	})
}
