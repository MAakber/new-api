package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

type exportRedemptionsRequest struct {
	Scope   string `json:"scope"`
	Ids     []int  `json:"ids"`
	Keyword string `json:"keyword"`
	Status  string `json:"status"`
}

func GetAllRedemptions(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	redemptions, total, err := model.GetAllRedemptions(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(redemptions)
	common.ApiSuccess(c, pageInfo)
	return
}

func SearchRedemptions(c *gin.Context) {
	keyword := c.Query("keyword")
	status := c.Query("status")
	pageInfo := common.GetPageQuery(c)
	redemptions, total, err := model.SearchRedemptions(keyword, status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(redemptions)
	common.ApiSuccess(c, pageInfo)
	return
}

func GetRedemption(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	redemption, err := model.GetRedemptionById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    redemption,
	})
	return
}

func AddRedemption(c *gin.Context) {
	if !operation_setting.IsPaymentComplianceConfirmed() {
		common.ApiErrorI18n(c, i18n.MsgPaymentComplianceRequired)
		return
	}

	redemption := model.Redemption{}
	err := c.ShouldBindJSON(&redemption)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if utf8.RuneCountInString(redemption.Name) == 0 || utf8.RuneCountInString(redemption.Name) > 20 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionNameLength)
		return
	}
	if redemption.Count <= 0 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountPositive)
		return
	}
	if redemption.Count > 100 {
		common.ApiErrorI18n(c, i18n.MsgRedemptionCountMax)
		return
	}
	if valid, msg := validateExpiredTime(c, redemption.ExpiredTime); !valid {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
		return
	}
	plan, err := validateRedemptionReward(&redemption)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	var keys []string
	for i := 0; i < redemption.Count; i++ {
		key := common.GetUUID()
		cleanRedemption := model.Redemption{
			UserId:      c.GetInt("id"),
			Name:        redemption.Name,
			Key:         key,
			CreatedTime: common.GetTimestamp(),
			Quota:       redemption.Quota,
			RewardType:  redemption.RewardType,
			PlanId:      redemption.PlanId,
			ExpiredTime: redemption.ExpiredTime,
		}
		err = cleanRedemption.Insert()
		if err != nil {
			common.SysError("failed to insert redemption: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": i18n.T(c, i18n.MsgRedemptionCreateFailed),
				"data":    keys,
			})
			return
		}
		keys = append(keys, key)
	}
	auditParams := map[string]interface{}{
		"name":        redemption.Name,
		"count":       redemption.Count,
		"reward_type": redemption.RewardType,
	}
	if redemption.RewardType == model.RedemptionRewardTypeSubscription {
		auditParams["plan_id"] = redemption.PlanId
		auditParams["plan_title"] = plan.Title
	} else {
		auditParams["quota"] = logger.LogQuota(redemption.Quota)
	}
	recordManageAudit(c, "redemption.create", auditParams)
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    keys,
	})
	return
}

func DeleteRedemption(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	err := model.DeleteRedemptionById(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
	return
}

func UpdateRedemption(c *gin.Context) {
	statusOnly := c.Query("status_only")
	redemption := model.Redemption{}
	err := c.ShouldBindJSON(&redemption)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	cleanRedemption, err := model.GetRedemptionById(redemption.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if statusOnly == "" {
		if cleanRedemption.Status == common.RedemptionCodeStatusUsed {
			common.ApiErrorMsg(c, "已使用的兑换码不能修改")
			return
		}
		if valid, msg := validateExpiredTime(c, redemption.ExpiredTime); !valid {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": msg})
			return
		}
		if strings.TrimSpace(redemption.RewardType) == "" {
			redemption.RewardType = cleanRedemption.RewardType
			redemption.PlanId = cleanRedemption.PlanId
		}
		if _, err = validateRedemptionReward(&redemption); err != nil {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		// If you add more fields, please also update redemption.Update()
		cleanRedemption.Name = redemption.Name
		cleanRedemption.Quota = redemption.Quota
		cleanRedemption.RewardType = redemption.RewardType
		cleanRedemption.PlanId = redemption.PlanId
		cleanRedemption.ExpiredTime = redemption.ExpiredTime
	}
	if statusOnly != "" {
		if err = validateRedemptionStatusUpdate(cleanRedemption.Status, redemption.Status); err != nil {
			common.ApiErrorMsg(c, err.Error())
			return
		}
		cleanRedemption.Status = redemption.Status
	}
	err = cleanRedemption.Update()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    cleanRedemption,
	})
	return
}

func validateRedemptionStatusUpdate(currentStatus int, nextStatus int) error {
	if currentStatus == common.RedemptionCodeStatusUsed {
		return errors.New("已使用的兑换码不能重新启用")
	}
	if nextStatus != common.RedemptionCodeStatusEnabled && nextStatus != common.RedemptionCodeStatusDisabled {
		return errors.New("无效的兑换码状态")
	}
	return nil
}

func ExportRedemptions(c *gin.Context) {
	var req exportRedemptionsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}

	var ids []int
	applyFilters := false
	switch req.Scope {
	case "selected":
		seen := make(map[int]struct{}, len(req.Ids))
		for _, id := range req.Ids {
			if id <= 0 {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
		if len(ids) == 0 {
			common.ApiErrorMsg(c, "请选择要导出的兑换码")
			return
		}
	case "filtered":
		applyFilters = true
	case "all":
	default:
		common.ApiErrorMsg(c, "无效的导出范围")
		return
	}

	redemptions, err := model.GetRedemptionsForExport(ids, req.Keyword, req.Status, applyFilters)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	filename := "redemption-codes-" + time.Now().Format("20060102-150405") + ".csv"
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Status(http.StatusOK)
	if err := writeRedemptionsCSV(c.Writer, redemptions); err != nil {
		common.SysError("failed to export redemptions: " + err.Error())
		return
	}
	recordManageAudit(c, "redemption.export", map[string]interface{}{
		"scope": req.Scope,
		"count": len(redemptions),
	})
}

func writeRedemptionsCSV(output io.Writer, redemptions []*model.Redemption) error {
	if _, err := output.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return err
	}
	w := csv.NewWriter(output)
	if err := w.Write([]string{
		"ID", "Name", "Reward Type", "Code", "Quota", "Plan ID", "Plan Title",
		"Status", "Created Time", "Expired Time", "Redeemed Time", "Used User ID",
		"Subscription ID",
	}); err != nil {
		return err
	}
	for _, redemption := range redemptions {
		if err := w.Write([]string{
			strconv.Itoa(redemption.Id),
			redemption.Name,
			redemption.RewardType,
			redemption.Key,
			strconv.Itoa(redemption.Quota),
			formatOptionalInt(redemption.PlanId),
			redemption.PlanTitle,
			redemptionExportStatus(redemption),
			formatExportTimestamp(redemption.CreatedTime),
			formatExportTimestamp(redemption.ExpiredTime),
			formatExportTimestamp(redemption.RedeemedTime),
			formatOptionalInt(redemption.UsedUserId),
			formatOptionalInt(redemption.RedeemedSubscriptionId),
		}); err != nil {
			return err
		}
	}
	w.Flush()
	return w.Error()
}

func validateRedemptionReward(redemption *model.Redemption) (*model.SubscriptionPlan, error) {
	redemption.RewardType = model.NormalizeRedemptionRewardType(redemption.RewardType)
	switch redemption.RewardType {
	case model.RedemptionRewardTypeQuota:
		redemption.PlanId = 0
		if redemption.Quota < 0 {
			return nil, errors.New("兑换额度不能为负数")
		}
		return nil, nil
	case model.RedemptionRewardTypeSubscription:
		redemption.Quota = 0
		if redemption.PlanId <= 0 {
			return nil, errors.New("请选择订阅套餐")
		}
		plan, err := model.GetSubscriptionPlanById(redemption.PlanId)
		if err != nil {
			return nil, errors.New("订阅套餐不存在")
		}
		if !plan.Enabled {
			return nil, errors.New("订阅套餐已禁用")
		}
		return plan, nil
	default:
		return nil, errors.New("无效的兑换码类型")
	}
}

func formatOptionalInt(value int) string {
	if value <= 0 {
		return ""
	}
	return strconv.Itoa(value)
}

func formatExportTimestamp(timestamp int64) string {
	if timestamp <= 0 {
		return ""
	}
	return time.Unix(timestamp, 0).UTC().Format(time.RFC3339)
}

func redemptionExportStatus(redemption *model.Redemption) string {
	if redemption.Status == common.RedemptionCodeStatusEnabled && redemption.ExpiredTime > 0 && redemption.ExpiredTime < common.GetTimestamp() {
		return "expired"
	}
	switch redemption.Status {
	case common.RedemptionCodeStatusEnabled:
		return "enabled"
	case common.RedemptionCodeStatusDisabled:
		return "disabled"
	case common.RedemptionCodeStatusUsed:
		return "used"
	default:
		return strconv.Itoa(redemption.Status)
	}
}

func DeleteInvalidRedemption(c *gin.Context) {
	rows, err := model.DeleteInvalidRedemptions()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    rows,
	})
	return
}

func validateExpiredTime(c *gin.Context, expired int64) (bool, string) {
	if expired != 0 && expired < common.GetTimestamp() {
		return false, i18n.T(c, i18n.MsgRedemptionExpireTimeInvalid)
	}
	return true, ""
}
