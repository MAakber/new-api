package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPricingPatchRejectsInvalidTaskBillingExpressions(t *testing.T) {
	db := usePricingControllerDB(t)
	_, err := jsplugin.DefaultRegistry.Register(`
export const meta = {
  apiVersion: 1, key: "billing-save-probe", name: "Billing Save Probe", version: "1.0.0", author: {name: "Test"},
  models: ["billing-save-model"], fetchMode: "per_task",
  usageSchema: {seconds: {type: "number", unit: "second"}}
};
export function buildSubmitRequest() { return {}; }
export function parseSubmitResponse() { return {}; }
export function buildQueryRequest() { return {}; }
export function parseTaskResult() { return {}; }
`, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("billing-save-probe") })
	var before model.Option
	require.NoError(t, db.Where("key = ?", "billing_setting.billing_expr").First(&before).Error)

	for _, test := range []struct{ name, modelName, expression, errorText string }{
		{"invalid syntax", "billing-save-model", `tier("base",`, "expr compile error"},
		{"undeclared usage key", "billing-save-model", `tier("base", u("clips") * 0.1)`, `usage key "clips" is not declared`},
		{"fixed request pricing", "billing-save-model", `tier("base", fixed(0.01))`, "fixed pricing is not supported for task usage expressions"},
		{"missing plugin schema", "billing-save-model-without-plugin", `u("mode") == "std" ? 1 : 2`, "no task plugin usage schema"},
	} {
		t.Run(test.name, func(t *testing.T) {
			body, err := common.Marshal(map[string]any{"operations": []map[string]any{{
				"key": "billing_setting.billing_expr", "model": test.modelName, "action": "set",
				"value": test.expression, "expected": map[string]bool{"present": false},
			}}})
			require.NoError(t, err)
			response := performPricingPatch(t, string(body))
			require.Equal(t, http.StatusBadRequest, response.Code, response.Body.String())
			var result struct {
				Success bool
				Message string
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
			assert.False(t, result.Success)
			assert.Contains(t, result.Message, test.modelName)
			assert.Contains(t, result.Message, test.errorText)
			var after model.Option
			require.NoError(t, db.Where("key = ?", before.Key).First(&after).Error)
			assert.Equal(t, before.Value, after.Value)
		})
	}
}
