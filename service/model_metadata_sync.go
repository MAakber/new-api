package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

const metadataDefaultBase = "https://basellm.github.io/llm-metadata"

type ModelMetadataVendor struct {
	Description string `json:"description"`
	Icon        string `json:"icon"`
	Name        string `json:"name"`
	Status      int    `json:"status"`
}
type ModelMetadataModel struct {
	Description string          `json:"description"`
	Endpoints   json.RawMessage `json:"endpoints"`
	Icon        string          `json:"icon"`
	ModelName   string          `json:"model_name"`
	NameRule    int             `json:"name_rule"`
	Status      int             `json:"status"`
	Tags        string          `json:"tags"`
	VendorName  string          `json:"vendor_name"`
}
type ModelMetadataOverwrite struct {
	ModelName string   `json:"model_name"`
	Fields    []string `json:"fields"`
}
type ModelMetadataSyncOptions struct {
	CreateMissingOnly bool
	Overwrite         []ModelMetadataOverwrite
	Locale            string
}
type ModelMetadataSource struct {
	Locale     string `json:"locale"`
	ModelsURL  string `json:"models_url"`
	VendorsURL string `json:"vendors_url"`
}
type ModelMetadataSummary struct {
	CreatedModels  int                 `json:"created_models"`
	CreatedVendors int                 `json:"created_vendors"`
	UpdatedModels  int                 `json:"updated_models"`
	SkippedModels  []string            `json:"skipped_models"`
	CreatedList    []string            `json:"created_list"`
	UpdatedList    []string            `json:"updated_list"`
	Source         ModelMetadataSource `json:"source"`
}
type ModelMetadataPreview struct {
	Missing   []string                `json:"missing"`
	Conflicts []ModelMetadataConflict `json:"conflicts"`
	Source    ModelMetadataSource     `json:"source"`
}
type ModelMetadataConflictField struct {
	Field    string      `json:"field"`
	Local    interface{} `json:"local"`
	Upstream interface{} `json:"upstream"`
}
type ModelMetadataConflict struct {
	ModelName string                       `json:"model_name"`
	Fields    []ModelMetadataConflictField `json:"fields"`
}
type metadataEnvelope[T any] struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
	Data    []T    `json:"data"`
}

func CanonicalModelMetadataURLs(locale string) ModelMetadataSource {
	base := strings.TrimRight(common.GetEnvOrDefaultString("SYNC_UPSTREAM_BASE", metadataDefaultBase), "/")
	l := strings.ToLower(strings.TrimSpace(locale))
	if l == "en" || l == "zh-cn" || l == "zh-tw" || l == "ja" {
		return ModelMetadataSource{Locale: l, ModelsURL: fmt.Sprintf("%s/api/i18n/%s/newapi/models.json", base, l), VendorsURL: fmt.Sprintf("%s/api/i18n/%s/newapi/vendors.json", base, l)}
	}
	return ModelMetadataSource{Locale: locale, ModelsURL: base + "/api/newapi/models.json", VendorsURL: base + "/api/newapi/vendors.json"}
}

func fetchMetadata(ctx context.Context, locale string) ([]ModelMetadataModel, []ModelMetadataVendor, ModelMetadataSource, error) {
	source := CanonicalModelMetadataURLs(locale)
	var models metadataEnvelope[ModelMetadataModel]
	var vendors metadataEnvelope[ModelMetadataVendor]
	var modelErr error
	var vendorErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _, modelErr = fetchMetadataEnvelope(ctx, source.ModelsURL, &models) }()
	go func() { defer wg.Done(); _, vendorErr = fetchMetadataEnvelope(ctx, source.VendorsURL, &vendors) }()
	wg.Wait()
	if modelErr != nil {
		return nil, nil, source, modelErr
	}
	if !models.Success {
		return nil, nil, source, fmt.Errorf("upstream models response was unsuccessful")
	}
	// Vendor metadata has always been optional. Keep that contract while
	// discarding malformed/unsuccessful vendor payloads rather than using them.
	if vendorErr != nil || !vendors.Success {
		vendors.Data = nil
	}
	return models.Data, vendors.Data, source, nil
}

// fetchMetadataEnvelope preserves the historical upstream compatibility: the
// documented envelope and legacy bare arrays are both accepted.
func fetchMetadataEnvelope[T any](ctx context.Context, url string, out *metadataEnvelope[T]) (bool, error) {
	attempts := common.GetEnvOrDefault("SYNC_HTTP_RETRY", 3)
	if attempts < 1 {
		attempts = 1
	}
	maxBytes := int64(common.GetEnvOrDefault("SYNC_HTTP_MAX_MB", 10)) << 20
	if maxBytes <= 0 {
		maxBytes = 10 << 20
	}
	var lastErr error
	for attempt := 0; attempt < attempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err == nil {
			resp, requestErr := http.DefaultClient.Do(req)
			if requestErr == nil {
				func() {
					defer resp.Body.Close()
					if resp.StatusCode != http.StatusOK {
						lastErr = fmt.Errorf("upstream metadata returned %s", resp.Status)
						return
					}
					body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxBytes+1))
					if readErr != nil || int64(len(body)) > maxBytes {
						lastErr = fmt.Errorf("invalid upstream metadata response")
						return
					}
					if json.Unmarshal(body, out) == nil {
						lastErr = nil
						return
					}
					var array []T
					if json.Unmarshal(body, &array) == nil {
						out.Success = true
						out.Data = array
						lastErr = nil
						return
					}
					lastErr = fmt.Errorf("invalid upstream metadata response")
				}()
			} else {
				lastErr = fmt.Errorf("unable to fetch upstream metadata")
			}
		} else {
			lastErr = fmt.Errorf("invalid upstream metadata request")
		}
		if lastErr == nil {
			return out.Success, nil
		}
		if attempt+1 < attempts {
			select {
			case <-ctx.Done():
				return false, ctx.Err()
			case <-time.After(time.Duration(attempt+1) * 100 * time.Millisecond):
			}
		}
	}
	return false, lastErr
}

func SyncModelMetadata(ctx context.Context, options ModelMetadataSyncOptions) (*ModelMetadataSummary, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	source := CanonicalModelMetadataURLs(options.Locale)
	result := &ModelMetadataSummary{SkippedModels: []string{}, CreatedList: []string{}, UpdatedList: []string{}, Source: source}
	missing, err := model.GetMissingModels()
	if err != nil {
		return nil, err
	}
	// Match the manual endpoint's historical fast path: when there is nothing
	// to create and no requested overwrite, do not contact upstream.
	if len(missing) == 0 && len(options.Overwrite) == 0 {
		return result, nil
	}
	models, vendors, source, err := fetchMetadata(ctx, options.Locale)
	if err != nil {
		return nil, err
	}
	result.Source = source
	vendorByName := map[string]ModelMetadataVendor{}
	modelByName := map[string]ModelMetadataModel{}
	for _, v := range vendors {
		if v.Name != "" {
			vendorByName[v.Name] = v
		}
	}
	for _, m := range models {
		if m.ModelName != "" {
			modelByName[m.ModelName] = m
		}
	}
	cache := map[string]int{}
	ensureVendor := func(name string) (int, error) {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		if name == "" {
			return 0, nil
		}
		if id, ok := cache[name]; ok {
			return id, nil
		}
		var existing model.Vendor
		if model.DB.Where("name = ?", name).First(&existing).Error == nil {
			cache[name] = existing.Id
			return existing.Id, nil
		}
		up := vendorByName[name]
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		v := &model.Vendor{Name: name, Description: up.Description, Icon: up.Icon, Status: status(up.Status, 1)}
		if v.Insert() == nil && v.Id != 0 {
			cache[name] = v.Id
			result.CreatedVendors++
			return v.Id, nil
		}
		return 0, nil
	}
	for _, name := range missing {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		up, ok := modelByName[name]
		if !ok {
			result.SkippedModels = append(result.SkippedModels, name)
			continue
		}
		var existing model.Model
		if model.DB.Where("model_name = ?", name).First(&existing).Error == nil {
			continue
		}
		vendorID, err := ensureVendor(up.VendorName)
		if err != nil {
			return nil, err
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		mi := &model.Model{ModelName: name, Description: up.Description, Icon: up.Icon, Tags: up.Tags, VendorID: vendorID, Status: status(up.Status, 1), SyncOfficial: 1, NameRule: up.NameRule}
		if mi.Insert() == nil && mi.Id != 0 {
			result.CreatedModels++
			result.CreatedList = append(result.CreatedList, name)
		} else {
			result.SkippedModels = append(result.SkippedModels, name)
		}
	}
	if options.CreateMissingOnly {
		return result, nil
	}
	for _, ow := range options.Overwrite {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		up, ok := modelByName[ow.ModelName]
		if !ok {
			continue
		}
		var local model.Model
		if model.DB.Where("model_name = ?", ow.ModelName).First(&local).Error != nil || local.SyncOfficial == 0 {
			continue
		}
		changed := false
		for _, f := range ow.Fields {
			switch strings.ToLower(strings.TrimSpace(f)) {
			case "description":
				local.Description = up.Description
				changed = true
			case "icon":
				local.Icon = up.Icon
				changed = true
			case "tags":
				local.Tags = up.Tags
				changed = true
			case "vendor":
				vendorID, err := ensureVendor(up.VendorName)
				if err != nil {
					return nil, err
				}
				local.VendorID = vendorID
				changed = true
			case "name_rule":
				local.NameRule = up.NameRule
				changed = true
			case "status":
				local.Status = status(up.Status, local.Status)
				changed = true
			}
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if changed && local.Update() == nil {
			result.UpdatedModels++
			result.UpdatedList = append(result.UpdatedList, ow.ModelName)
		}
	}
	return result, nil
}
func status(primary, fallback int) int {
	if primary != 0 {
		return primary
	}
	if fallback != 0 {
		return fallback
	}
	return 1
}

func PreviewModelMetadata(ctx context.Context, locale string) (*ModelMetadataPreview, error) {
	models, _, source, err := fetchMetadata(ctx, locale)
	if err != nil {
		return nil, err
	}
	byName := map[string]ModelMetadataModel{}
	names := []string{}
	for _, m := range models {
		if m.ModelName != "" {
			byName[m.ModelName] = m
			names = append(names, m.ModelName)
		}
	}
	var locals []model.Model
	if len(names) > 0 {
		if err := model.DB.Where("model_name IN ? AND sync_official <> 0", names).Find(&locals).Error; err != nil {
			return nil, err
		}
	}
	vendorNames := map[int]string{}
	var dbV []model.Vendor
	if err := model.DB.Find(&dbV).Error; err != nil {
		return nil, err
	}
	for _, v := range dbV {
		vendorNames[v.Id] = v.Name
	}
	out := &ModelMetadataPreview{Missing: []string{}, Conflicts: []ModelMetadataConflict{}, Source: source}
	missing, _ := model.GetMissingModels()
	for _, n := range missing {
		if _, ok := byName[n]; ok {
			out.Missing = append(out.Missing, n)
		}
	}
	for _, l := range locals {
		u := byName[l.ModelName]
		fs := []ModelMetadataConflictField{}
		if strings.TrimSpace(l.Description) != strings.TrimSpace(u.Description) {
			fs = append(fs, ModelMetadataConflictField{"description", l.Description, u.Description})
		}
		if strings.TrimSpace(l.Icon) != strings.TrimSpace(u.Icon) {
			fs = append(fs, ModelMetadataConflictField{"icon", l.Icon, u.Icon})
		}
		if strings.TrimSpace(l.Tags) != strings.TrimSpace(u.Tags) {
			fs = append(fs, ModelMetadataConflictField{"tags", l.Tags, u.Tags})
		}
		if strings.TrimSpace(vendorNames[l.VendorID]) != strings.TrimSpace(u.VendorName) {
			fs = append(fs, ModelMetadataConflictField{"vendor", vendorNames[l.VendorID], u.VendorName})
		}
		if l.NameRule != u.NameRule {
			fs = append(fs, ModelMetadataConflictField{"name_rule", l.NameRule, u.NameRule})
		}
		if l.Status != status(u.Status, l.Status) {
			fs = append(fs, ModelMetadataConflictField{"status", l.Status, u.Status})
		}
		if len(fs) > 0 {
			out.Conflicts = append(out.Conflicts, ModelMetadataConflict{l.ModelName, fs})
		}
	}
	return out, nil
}
