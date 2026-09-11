package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"

	"github.com/gin-gonic/gin"
)

func SetVideoRouter(router *gin.Engine) {
	videoSharedRouter := router.Group("/v1")
	videoSharedRouter.Use(middleware.RouteTag("relay"))
	videoSharedRouter.Use(middleware.TokenAuth(), middleware.RelayAutoBanClientMetrics(), middleware.RelayUserAgentBlacklist(), middleware.UserRequestRateLimit())
	videoSharedRouter.Use(middleware.SystemPerformanceCheck())
	videoSharedRouter.POST(
		"/video/generations",
		middleware.TaskPluginEndpointCandidates(),
		middleware.Distribute(),
		middleware.PinTaskPluginEndpoint(),
		middleware.TaskPluginEndpointOnly(middleware.ModelRequestRateLimit()),
		middleware.PrepareTaskPluginEndpoint(),
		func(c *gin.Context) {
			controller.RelayTaskPluginEndpoint(c, controller.RelayTask)
		},
	)

	videoV1Router := router.Group("/v1")
	videoV1Router.Use(middleware.RouteTag("relay"))
	videoV1Router.Use(middleware.TokenAuth(), middleware.RelayAutoBanClientMetrics(), middleware.RelayUserAgentBlacklist())
	{
		submitRouter := videoV1Router.Group("")
		submitRouter.Use(middleware.UserRequestRateLimit(), middleware.Distribute())
		submitRouter.POST("/videos/:video_id/remix", controller.RelayTask)

		fetchRouter := videoV1Router.Group("")
		fetchRouter.Use(middleware.Distribute())
		fetchRouter.GET("/video/generations/:task_id", controller.RelayTaskFetch)
	}

	klingV1Router := router.Group("/kling/v1")
	klingV1Router.Use(middleware.RouteTag("relay"))
	klingV1Router.Use(middleware.KlingRequestConvert(), middleware.TokenAuth(), middleware.RelayAutoBanClientMetrics(), middleware.RelayUserAgentBlacklist())
	{
		submitRouter := klingV1Router.Group("")
		submitRouter.Use(middleware.UserRequestRateLimit(), middleware.Distribute())
		submitRouter.POST("/videos/text2video", controller.RelayTask)
		submitRouter.POST("/videos/image2video", controller.RelayTask)

		fetchRouter := klingV1Router.Group("")
		fetchRouter.Use(middleware.Distribute())
		fetchRouter.GET("/videos/text2video/:task_id", controller.RelayTaskFetch)
		fetchRouter.GET("/videos/image2video/:task_id", controller.RelayTaskFetch)
	}

	// Jimeng official API routes - direct mapping to official API format
	jimengOfficialGroup := router.Group("jimeng")
	jimengOfficialGroup.Use(middleware.RouteTag("relay"))
	jimengOfficialGroup.Use(middleware.JimengRequestConvert(), middleware.TokenAuth(), middleware.RelayAutoBanClientMetrics(), middleware.RelayUserAgentBlacklist())
	{
		jimengSubmitRouter := jimengOfficialGroup.Group("")
		jimengSubmitRouter.Use(middleware.UserRequestRateLimitSubmit(), middleware.Distribute())
		// Maps to: /?Action=CVSync2AsyncSubmitTask&Version=2022-08-31 and /?Action=CVSync2AsyncGetResult&Version=2022-08-31
		jimengSubmitRouter.POST("/", controller.RelayTask)
	}
}
