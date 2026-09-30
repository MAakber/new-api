package common

import (
	"fmt"
	"io"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

// NewOutboundJSONBody wraps the already-marshaled upstream request body into a
// BodyStorage. When disk cache is enabled and the payload exceeds the configured
// threshold, the data is written to a temp file and the original []byte can be
// GC'd, significantly reducing the heap residency while waiting for the
// upstream provider to respond (the dominant cost for large base64 payloads).
//
// In memory mode the underlying memoryStorage reuses the same backing array,
// so this is equivalent to bytes.NewReader(data) in terms of memory usage.
//
// The caller MUST invoke closer.Close() once the upstream call has finished
// (typically via defer) to release the disk file / memory accounting.
//
// The returned body exposes its size and replay capability without exposing
// io.Closer. Request construction uses that metadata to populate ContentLength
// and GetBody, while the caller retains ownership of the underlying storage
// through the separately returned closer.
func NewOutboundJSONBody(data []byte) (body common.ReplayableBody, closer io.Closer, err error) {
	storage, err := common.CreateBodyStorage(data)
	if err != nil {
		return nil, nil, err
	}
	return common.NewReplayableBodyReader(storage), storage, nil
}

// NewMappedPassthroughBody preserves the original JSON except for an explicit
// channel model redirect. Keep the shared inbound storage immutable: another
// channel attempt must apply its own mapping to the client's original body.
// Callers own closer, including when the original replay source is reused.
func NewMappedPassthroughBody(c *gin.Context, info *RelayInfo) (common.ReplayableBody, io.Closer, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, nil, err
	}
	if info == nil || info.ChannelMeta == nil || !info.IsModelMapped || info.UpstreamModelName == "" {
		body := common.NewReplayableBodyReader(storage)
		return body, io.NopCloser(body), nil
	}
	data, err := storage.Bytes()
	if err != nil {
		return nil, nil, err
	}
	if !gjson.ValidBytes(data) || !gjson.ParseBytes(data).IsObject() {
		return nil, nil, fmt.Errorf("model mapping requires a JSON object request body")
	}
	data, err = sjson.SetBytes(data, "model", info.UpstreamModelName)
	if err != nil {
		return nil, nil, err
	}
	return NewOutboundJSONBody(data)
}
