package service

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"sort"
	"strings"
	"sync"
)

// NormalizeModelMetadataLocale includes the downstream Traditional Chinese source.
func NormalizeModelMetadataLocale(locale string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(locale)) {
	case "", "zh", "zh-cn":
		return "zh", true
	case "en":
		return "en", true
	case "ja":
		return "ja", true
	case "zh-tw":
		return "zh-tw", true
	default:
		return "", false
	}
}

type ModelMetadataCatalogSource struct {
	Locale     string `json:"locale"`
	ModelsURL  string `json:"models_url"`
	VendorsURL string `json:"vendors_url"`
	Version    string `json:"version"`
}

type ModelMetadataCatalogField struct {
	Field    string `json:"field"`
	Local    any    `json:"local"`
	Upstream any    `json:"upstream"`
}

type ModelMetadataCatalogCandidate struct {
	ModelName      string                      `json:"model_name"`
	Kind           string                      `json:"kind"`
	Scope          string                      `json:"scope"`
	RecordVersion  string                      `json:"record_version"`
	Fields         []ModelMetadataCatalogField `json:"fields"`
	Upstream       *model.MetadataValues       `json:"upstream,omitempty"`
	VendorToCreate string                      `json:"vendor_to_create,omitempty"`
}

func fetchModelMetadataCatalog(ctx context.Context, locale string) (ModelMetadataCatalogSource, map[string]model.MetadataValues, map[string]model.Vendor, error) {
	resolved, valid := NormalizeModelMetadataLocale(locale)
	if !valid {
		return ModelMetadataCatalogSource{}, nil, nil, errors.New("unsupported metadata language")
	}
	urls := CanonicalModelMetadataURLs(resolved)
	source := ModelMetadataCatalogSource{Locale: resolved, ModelsURL: urls.ModelsURL, VendorsURL: urls.VendorsURL}
	var modelsEnv metadataEnvelope[ModelMetadataModel]
	var vendorsEnv metadataEnvelope[ModelMetadataVendor]
	var modelsErr, vendorsErr error
	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); _, modelsErr = fetchMetadataEnvelope(ctx, source.ModelsURL, &modelsEnv) }()
	go func() { defer wg.Done(); _, vendorsErr = fetchMetadataEnvelope(ctx, source.VendorsURL, &vendorsEnv) }()
	wg.Wait()
	if modelsErr != nil || vendorsErr != nil {
		return source, nil, nil, errors.New("unable to fetch upstream metadata")
	}
	if !modelsEnv.Success || !vendorsEnv.Success {
		return source, nil, nil, errors.New("upstream metadata source reported failure")
	}
	models := make(map[string]model.MetadataValues)
	vendors := make(map[string]model.Vendor)
	for _, vendor := range vendorsEnv.Data {
		vendor.Name = strings.TrimSpace(vendor.Name)
		if vendor.Name == "" {
			continue
		}
		vendors[vendor.Name] = model.Vendor{Name: vendor.Name, Description: vendor.Description, Icon: vendor.Icon, Status: vendor.Status}
	}
	for _, item := range modelsEnv.Data {
		if strings.TrimSpace(item.ModelName) == "" {
			continue
		}
		endpoints := ""
		if len(item.Endpoints) > 0 && string(item.Endpoints) != "null" {
			if err := common.Unmarshal(item.Endpoints, &endpoints); err != nil {
				endpoints = string(item.Endpoints)
			}
		}
		values := model.MetadataValues{Description: item.Description, Icon: item.Icon, Tags: item.Tags, Vendor: strings.TrimSpace(item.VendorName), Endpoints: endpoints, NameRule: item.NameRule, Status: item.Status}
		if err := model.ValidateMetadataValues(values); err != nil {
			return source, nil, nil, fmt.Errorf("model %s: %w", item.ModelName, err)
		}
		if _, duplicate := models[item.ModelName]; duplicate {
			return source, nil, nil, fmt.Errorf("duplicate upstream model: %s", item.ModelName)
		}
		models[item.ModelName] = values
	}
	encoded, err := common.Marshal([]any{source.Locale, models, vendors})
	if err != nil {
		return source, nil, nil, err
	}
	source.Version = fmt.Sprintf("%x", sha256.Sum256(encoded))
	return source, models, vendors, nil
}

func PreviewModelMetadataCatalog(ctx context.Context, locale string) (*ModelMetadataCatalogPreview, error) {
	source, upstream, upstreamVendors, err := fetchModelMetadataCatalog(ctx, locale)
	if err != nil {
		return nil, err
	}
	locals, vendors, err := model.GetMetadataSyncState(model.DB.WithContext(ctx))
	if err != nil {
		return nil, err
	}
	missing, err := model.GetMissingModels()
	if err != nil {
		return nil, err
	}
	siteNames := make(map[string]bool)
	allNames := make(map[string]bool)
	for name := range locals {
		siteNames[name] = true
		allNames[name] = true
	}
	for _, name := range missing {
		siteNames[name] = true
		allNames[name] = true
	}
	for name := range upstream {
		allNames[name] = true
	}
	names := make([]string, 0, len(allNames))
	for name := range allNames {
		names = append(names, name)
	}
	sort.Strings(names)
	vendorByID := make(map[int]*model.Vendor)
	for _, vendor := range vendors {
		vendorByID[vendor.Id] = vendor
	}
	candidates := make([]ModelMetadataCatalogCandidate, 0, len(names))
	for _, name := range names {
		candidate := ModelMetadataCatalogCandidate{ModelName: name, Scope: "catalog", Kind: "create", Fields: []ModelMetadataCatalogField{}}
		if siteNames[name] {
			candidate.Scope = "site"
		}
		local := locals[name]
		up, found := upstream[name]
		if !found {
			candidate.Kind = "missing_upstream"
			candidates = append(candidates, candidate)
			continue
		}
		candidate.Upstream = &up
		var localVendor *model.Vendor
		if local != nil {
			localVendor = vendorByID[local.VendorID]
		}
		candidate.RecordVersion = model.MetadataRecordVersion(local, localVendor, model.FindMetadataVendor(vendors, up.Vendor))
		if local != nil && local.SyncOfficial == 0 {
			candidate.Kind = "blocked"
			candidates = append(candidates, candidate)
			continue
		}
		if up.Vendor != "" && model.FindMetadataVendor(vendors, up.Vendor) == nil {
			if _, exists := upstreamVendors[up.Vendor]; !exists {
				candidate.Kind = "missing_vendor"
				candidates = append(candidates, candidate)
				continue
			}
			candidate.VendorToCreate = up.Vendor
		}
		localValues := model.MetadataValues{}
		if local != nil {
			candidate.Kind = "update"
			localValues = model.MetadataValues{Description: local.Description, Icon: local.Icon, Tags: local.Tags, Endpoints: local.Endpoints, NameRule: local.NameRule, Status: local.Status}
			if localVendor != nil {
				localValues.Vendor = localVendor.Name
			}
		}
		localRaw, _ := common.Marshal(localValues)
		upRaw, _ := common.Marshal(up)
		var localFields, upFields map[string]any
		_ = common.Unmarshal(localRaw, &localFields)
		_ = common.Unmarshal(upRaw, &upFields)
		for _, field := range model.MetadataSyncFields {
			if local == nil || localFields[field] != upFields[field] {
				candidate.Fields = append(candidate.Fields, ModelMetadataCatalogField{Field: field, Local: localFields[field], Upstream: upFields[field]})
			}
		}
		if local != nil && len(candidate.Fields) == 0 {
			candidate.Kind = "unchanged"
		}
		candidates = append(candidates, candidate)
	}
	return &ModelMetadataCatalogPreview{Source: source, Candidates: candidates}, nil
}

type ModelMetadataCatalogPreview struct {
	Source     ModelMetadataCatalogSource      `json:"source"`
	Candidates []ModelMetadataCatalogCandidate `json:"candidates"`
}

// SyncSelectedModelMetadata validates both source and local record versions.
// Manual callers hold the same named lease as the scheduled metadata job.
func SyncSelectedModelMetadata(ctx context.Context, locale, sourceVersion string, selections []model.MetadataSyncSelection) (*model.MetadataSyncResult, error) {
	source, upstream, vendors, err := fetchModelMetadataCatalog(ctx, locale)
	if err != nil {
		return nil, err
	}
	if source.Version != sourceVersion {
		return nil, fmt.Errorf("%w: upstream metadata changed", model.ErrMetadataSyncConflict)
	}
	updates := make([]model.MetadataSyncUpdate, 0, len(selections))
	for _, selection := range selections {
		values, exists := upstream[selection.ModelName]
		if !exists {
			return nil, fmt.Errorf("%w: selected upstream model is no longer available", model.ErrMetadataSyncConflict)
		}
		updates = append(updates, model.MetadataSyncUpdate{MetadataSyncSelection: selection, Values: values})
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return model.ApplyMetadataSync(updates, vendors)
}
