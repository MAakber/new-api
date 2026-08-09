package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionRejectsZeroUserRequestRateLimitDefault(t *testing.T) {
	previousDefault := setting.UserRequestRateLimitDefault
	setting.UserRequestRateLimitDefault = setting.DefaultUserRequestsPerMinute
	t.Cleanup(func() { setting.UserRequestRateLimitDefault = previousDefault })

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(
		http.MethodPut,
		"/api/option/",
		strings.NewReader(`{"key":"UserRequestRateLimitDefault","value":0}`),
	)
	context.Request.Header.Set("Content-Type", "application/json")

	UpdateOption(context)

	require.Equal(t, http.StatusBadRequest, recorder.Code)
	assert.Equal(t, setting.DefaultUserRequestsPerMinute, setting.UserRequestRateLimitDefault)
}
