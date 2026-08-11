package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/stretchr/testify/require"
)

func TestNewSensitiveWordViolationErrorUsesConfiguredResponse(t *testing.T) {
	err := newSensitiveWordViolationError(model.AutoBanResponse{
		Status:  422,
		Code:    "content_risk_control",
		Message: "Risk control (1/5)",
	})

	require.Equal(t, 422, err.StatusCode)
	require.Equal(t, types.ErrorCode("content_risk_control"), err.GetErrorCode())
	response := err.ToOpenAIError()
	require.Equal(t, "Risk control (1/5)", response.Message)
	require.Equal(t, types.ErrorCode("content_risk_control"), response.Code)
}

func TestNewSensitiveWordViolationErrorFallsBackToBadRequest(t *testing.T) {
	err := newSensitiveWordViolationError(model.AutoBanResponse{})

	require.Equal(t, 400, err.StatusCode)
	require.Equal(t, types.ErrorCodeSensitiveWordsDetected, err.GetErrorCode())
	require.Equal(t, "Sensitive words detected", err.ToOpenAIError().Message)
}
