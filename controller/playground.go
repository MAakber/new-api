package controller

import (
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"

	"github.com/gin-gonic/gin"
)

func Playground(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			writePlaygroundError(c, newAPIError)
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	relayFormat := types.RelayFormatOpenAI
	if strings.HasPrefix(c.Request.URL.Path, "/pg/images/") {
		relayFormat = types.RelayFormatOpenAIImage
	}
	relayInfo, err := relaycommon.GenRelayInfo(c, relayFormat, nil, nil)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	// Write user context to ensure acceptUnsetRatio is available
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	tempToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	_ = middleware.SetupContextForToken(c, tempToken)

	if relayFormat == types.RelayFormatOpenAIImage {
		Relay(c, relayFormat)
		return
	}

	var playgroundRequest dto.GeneralOpenAIRequest
	if err := common.UnmarshalBodyReusable(c, &playgroundRequest); err == nil && isPlaygroundWebSearchEnabled(playgroundRequest.WebSearch) {
		newAPIError = playgroundWithWebSearch(c, &playgroundRequest)
		return
	}

	Relay(c, types.RelayFormatOpenAI)
}

func writePlaygroundError(c *gin.Context, apiError *types.NewAPIError) {
	body := gin.H{"error": apiError.ToOpenAIError()}
	if c.Writer.Written() && strings.HasPrefix(c.Writer.Header().Get("Content-Type"), "text/event-stream") {
		if err := helper.ObjectData(c, body); err == nil {
			helper.Done(c)
		}
		return
	}
	c.JSON(apiError.StatusCode, body)
}
