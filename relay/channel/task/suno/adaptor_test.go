package suno

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLegacyBatchResultPreservesTaskIdentityAndPayload(t *testing.T) {
	adaptor := &TaskAdaptor{}
	results, err := adaptor.ParseBatchResult(nil, &http.Response{StatusCode: http.StatusOK}, []byte(`{
		"code":"success","data":[
			{"task_id":"private-music","action":"MUSIC","status":"SUCCESS","submit_time":10,"start_time":11,"finish_time":12,"data":[{"audio_url":"https://media.example/song.mp3"}]},
			{"task_id":"private-lyrics","action":"LYRICS","status":"FAILURE","fail_reason":"upstream failed","data":null}
		]
	}`))
	require.NoError(t, err)
	require.Len(t, results, 2)
	require.Contains(t, results, "private-music")
	require.Contains(t, results, "private-lyrics")
	assert.EqualValues(t, model.TaskStatusSuccess, results["private-music"].TaskInfo.Status)
	assert.Equal(t, constant.SunoActionMusic, results["private-music"].Action)
	assert.EqualValues(t, 12, results["private-music"].FinishTime)
	data, err := common.Marshal(results["private-music"].Data)
	require.NoError(t, err)
	assert.JSONEq(t, `[{"audio_url":"https://media.example/song.mp3"}]`, string(data))
	assert.EqualValues(t, model.TaskStatusFailure, results["private-lyrics"].TaskInfo.Status)
	assert.Equal(t, "upstream failed", results["private-lyrics"].TaskInfo.Reason)
}
