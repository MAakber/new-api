package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

func bannerDTO(value *model.Banner) dto.Banner {
	if value == nil {
		return dto.Banner{}
	}
	return dto.BannerFromValues(value.Id, dto.BannerValues{
		Content:     value.Content,
		PublishDate: value.PublishDate,
		Type:        value.Type,
		Extra:       value.Extra,
		Enabled:     value.Enabled,
		SortOrder:   value.SortOrder,
		StartDate:   value.StartDate,
		EndDate:     value.EndDate,
		Link:        value.Link,
	})
}

func bannerDTOs(values []*model.Banner) []dto.Banner {
	result := make([]dto.Banner, 0, len(values))
	for _, value := range values {
		result = append(result, bannerDTO(value))
	}
	return result
}

func GetPublicBanners(c *gin.Context) {
	banners, err := model.GetVisibleBanners(time.Now())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, bannerDTOs(banners))
}

func GetBanners(c *gin.Context) {
	banners, err := model.GetAllBanners()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, bannerDTOs(banners))
}

func CreateBanner(c *gin.Context) {
	var request dto.BannerRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	values, err := request.ToValues()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	banner := model.Banner{
		Content:     values.Content,
		PublishDate: values.PublishDate,
		Type:        values.Type,
		Extra:       values.Extra,
		Enabled:     values.Enabled,
		SortOrder:   values.SortOrder,
		StartDate:   values.StartDate,
		EndDate:     values.EndDate,
		Link:        values.Link,
	}
	if err := model.CreateBanner(&banner); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "banner.create", map[string]interface{}{
		"id":   banner.Id,
		"type": banner.Type,
	})
	common.ApiSuccess(c, bannerDTO(&banner))
}

func UpdateBanner(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的 Banner ID")
		return
	}
	current, err := model.GetBannerByID(id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	var request dto.BannerRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		common.ApiError(c, err)
		return
	}
	_, updates, err := request.Apply(dto.BannerValues{
		Content:     current.Content,
		PublishDate: current.PublishDate,
		Type:        current.Type,
		Extra:       current.Extra,
		Enabled:     current.Enabled,
		SortOrder:   current.SortOrder,
		StartDate:   current.StartDate,
		EndDate:     current.EndDate,
		Link:        current.Link,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	updated, err := model.UpdateBanner(id, updates)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "banner.update", map[string]interface{}{
		"id":   id,
		"type": updated.Type,
	})
	common.ApiSuccess(c, bannerDTO(updated))
}

func DeleteBanner(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的 Banner ID")
		return
	}
	if err := model.DeleteBanner(id); err != nil {
		common.ApiError(c, err)
		return
	}
	recordManageAudit(c, "banner.delete", map[string]interface{}{"id": id})
	common.ApiSuccess(c, nil)
}
