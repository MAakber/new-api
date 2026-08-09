package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func registerBannerRoutes(apiRouter *gin.RouterGroup) {
	apiRouter.GET("/banners", controller.GetPublicBanners)

	bannerRoute := apiRouter.Group("/banner")
	bannerRoute.Use(middleware.AdminAuth())
	{
		bannerRoute.GET("", controller.GetBanners)
		bannerRoute.POST("", controller.CreateBanner)
		bannerRoute.PUT("/:id", controller.UpdateBanner)
		bannerRoute.DELETE("/:id", controller.DeleteBanner)
	}
}
