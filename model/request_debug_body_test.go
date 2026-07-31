package model

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRequestDebugBodyStoresAndRetrievesFullPayload(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, db.AutoMigrate(&RequestDebugBodyRecord{}, &RequestDebugBodyChunk{}))

	payload := make([]byte, 100000)
	state := uint32(0x12345678)
	for i := range payload {
		state = state*1664525 + 1013904223
		payload[i] = byte(state >> 24)
	}
	requestID := "request-debug-full-payload"
	require.NoError(t, StoreRequestDebugBody(context.Background(), requestID, "application/json", payload, int64(len(payload)), false))

	stored, err := GetRequestDebugBody(context.Background(), requestID)
	require.NoError(t, err)
	require.Equal(t, payload, stored.Data)
	require.Equal(t, int64(len(payload)), stored.BodyBytes)
	require.Equal(t, "application/json", stored.ContentType)
	require.Equal(t, "gzip", stored.Compression)
	require.False(t, stored.BodyTruncated)

	var chunkCount int64
	require.NoError(t, db.Model(&RequestDebugBodyChunk{}).Where("request_id = ?", requestID).Count(&chunkCount).Error)
	require.Greater(t, chunkCount, int64(1))
}

func TestDeleteOldRequestDebugBodyBatchRemovesMetadataAndChunks(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	previousDB := DB
	DB = db
	t.Cleanup(func() { DB = previousDB })
	require.NoError(t, db.AutoMigrate(&RequestDebugBodyRecord{}, &RequestDebugBodyChunk{}))

	requestID := "request-debug-cleanup"
	require.NoError(t, StoreRequestDebugBody(context.Background(), requestID, "text/plain", []byte("payload"), 7, false))

	deleted, err := DeleteOldRequestDebugBodyBatch(context.Background(), 1<<62, 100)
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)
	_, err = GetRequestDebugBody(context.Background(), requestID)
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	var chunks int64
	require.NoError(t, db.Model(&RequestDebugBodyChunk{}).Where("request_id = ?", requestID).Count(&chunks).Error)
	require.Zero(t, chunks)
}
