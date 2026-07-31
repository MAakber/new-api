package model

import (
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	// RequestDebugBodyMaxBytes bounds the sensitive payload retained for on-demand
	// diagnostics. The normal log row only stores metadata and a reference.
	RequestDebugBodyMaxBytes  int64 = 4 * 1024 * 1024
	requestDebugBodyChunkSize       = 32 * 1024
)

type RequestDebugBodyRecord struct {
	RequestID     string `gorm:"primaryKey;size:64"`
	CreatedAt     int64  `gorm:"index"`
	ContentType   string `gorm:"size:255"`
	BodyBytes     int64
	StoredBytes   int64
	ChunkCount    int
	Compression   string `gorm:"size:16"`
	BodyTruncated bool
}

type RequestDebugBodyChunk struct {
	RequestID string `gorm:"primaryKey;size:64;index:idx_request_debug_body_chunks,priority:1"`
	Sequence  int    `gorm:"primaryKey;index:idx_request_debug_body_chunks,priority:2"`
	Data      []byte
}

type StoredRequestDebugBody struct {
	Data          []byte
	ContentType   string
	BodyBytes     int64
	StoredBytes   int64
	Compression   string
	BodyTruncated bool
}

func StoreRequestDebugBody(ctx context.Context, requestID, contentType string, data []byte, bodyBytes int64, truncated bool) error {
	if DB == nil {
		return errors.New("main database is not initialized")
	}
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return errors.New("request ID is required")
	}
	if bodyBytes < int64(len(data)) {
		bodyBytes = int64(len(data))
	}
	if int64(len(data)) > RequestDebugBodyMaxBytes {
		data = data[:RequestDebugBodyMaxBytes]
		truncated = true
	}

	compressed, err := compressRequestDebugBody(data)
	if err != nil {
		return err
	}
	chunks := make([]RequestDebugBodyChunk, 0, (len(compressed)+requestDebugBodyChunkSize-1)/requestDebugBodyChunkSize)
	for sequence, start := 0, 0; start < len(compressed); sequence, start = sequence+1, start+requestDebugBodyChunkSize {
		end := start + requestDebugBodyChunkSize
		if end > len(compressed) {
			end = len(compressed)
		}
		chunks = append(chunks, RequestDebugBodyChunk{
			RequestID: requestID,
			Sequence:  sequence,
			Data:      append([]byte(nil), compressed[start:end]...),
		})
	}
	record := RequestDebugBodyRecord{
		RequestID:     requestID,
		CreatedAt:     common.GetTimestamp(),
		ContentType:   strings.TrimSpace(contentType),
		BodyBytes:     bodyBytes,
		StoredBytes:   int64(len(compressed)),
		ChunkCount:    len(chunks),
		Compression:   "gzip",
		BodyTruncated: truncated,
	}

	return DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("request_id = ?", requestID).Delete(&RequestDebugBodyChunk{}).Error; err != nil {
			return err
		}
		if err := tx.Where("request_id = ?", requestID).Delete(&RequestDebugBodyRecord{}).Error; err != nil {
			return err
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		if len(chunks) > 0 {
			if err := tx.Create(&chunks).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func GetRequestDebugBody(ctx context.Context, requestID string) (*StoredRequestDebugBody, error) {
	if DB == nil {
		return nil, errors.New("main database is not initialized")
	}
	requestID = strings.TrimSpace(requestID)
	if requestID == "" {
		return nil, gorm.ErrRecordNotFound
	}
	var record RequestDebugBodyRecord
	if err := DB.WithContext(ctx).Where("request_id = ?", requestID).First(&record).Error; err != nil {
		return nil, err
	}
	var chunks []RequestDebugBodyChunk
	if err := DB.WithContext(ctx).Where("request_id = ?", requestID).Order("sequence asc").Find(&chunks).Error; err != nil {
		return nil, err
	}
	compressed := bytes.Buffer{}
	for _, chunk := range chunks {
		_, _ = compressed.Write(chunk.Data)
	}
	data, err := decompressRequestDebugBody(compressed.Bytes())
	if err != nil {
		return nil, err
	}
	return &StoredRequestDebugBody{
		Data:          data,
		ContentType:   record.ContentType,
		BodyBytes:     record.BodyBytes,
		StoredBytes:   record.StoredBytes,
		Compression:   record.Compression,
		BodyTruncated: record.BodyTruncated,
	}, nil
}

func DeleteOldRequestDebugBodyBatch(ctx context.Context, targetTimestamp int64, limit int) (int64, error) {
	if DB == nil {
		return 0, errors.New("main database is not initialized")
	}
	if limit <= 0 {
		limit = 100
	}
	var records []RequestDebugBodyRecord
	if err := DB.WithContext(ctx).
		Where("created_at < ?", targetTimestamp).
		Order("created_at asc").
		Limit(limit).
		Find(&records).Error; err != nil {
		return 0, err
	}
	if len(records) == 0 {
		return 0, nil
	}
	requestIDs := make([]string, 0, len(records))
	for _, record := range records {
		requestIDs = append(requestIDs, record.RequestID)
	}
	var deleted int64
	err := DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("request_id IN ?", requestIDs).Delete(&RequestDebugBodyChunk{}).Error; err != nil {
			return err
		}
		result := tx.Where("request_id IN ?", requestIDs).Delete(&RequestDebugBodyRecord{})
		deleted = result.RowsAffected
		return result.Error
	})
	return deleted, err
}

func compressRequestDebugBody(data []byte) ([]byte, error) {
	var compressed bytes.Buffer
	writer := gzip.NewWriter(&compressed)
	if _, err := writer.Write(data); err != nil {
		_ = writer.Close()
		return nil, fmt.Errorf("compress request debug body: %w", err)
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close request debug body compression: %w", err)
	}
	return compressed.Bytes(), nil
}

func decompressRequestDebugBody(data []byte) ([]byte, error) {
	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("open request debug body compression: %w", err)
	}
	decompressed, readErr := io.ReadAll(io.LimitReader(reader, RequestDebugBodyMaxBytes+1))
	closeErr := reader.Close()
	if readErr != nil {
		return nil, fmt.Errorf("read request debug body: %w", readErr)
	}
	if closeErr != nil {
		return nil, fmt.Errorf("close request debug body compression: %w", closeErr)
	}
	if int64(len(decompressed)) > RequestDebugBodyMaxBytes {
		return nil, errors.New("request debug body exceeds configured limit")
	}
	return decompressed, nil
}
