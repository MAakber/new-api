/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  classifyModel,
  MODEL_TYPES,
  type ModelClassification,
  type ModelProvider,
  type ModelType,
} from '@/lib/model-classification'
import { useFetchModelPreferences } from '@/stores/fetch-model-preferences-store'

import { fetchUpstreamModels } from '../api'
import {
  categorizeModelsWithRedirect,
  normalizeModelName,
  parseModelsString,
} from '../lib/model-mapping-validation'
import type { Channel } from '../types'

export type FetchModelsTab = 'new' | 'existing' | 'removed'

export interface FetchedModel extends ModelClassification {
  id: string
  tab: FetchModelsTab
  redirectOnly: boolean
}

export interface FetchedModelGroup {
  provider: ModelProvider | null
  models: FetchedModel[]
}

interface FetchModelsOptions {
  channel: Channel | null
  customFetcher?: () => Promise<string[]>
  existingModelsOverride?: string[]
  redirectModels?: string[]
  redirectSourceModels?: string[]
}

function normalizeModelList(models: readonly string[]): string[] {
  return [...new Set(models.map(normalizeModelName).filter(Boolean))]
}

export function useFetchModels(options: FetchModelsOptions) {
  const { t } = useTranslation()
  const sessionId = useId()
  const [initial] = useState(() => ({
    existing: normalizeModelList(
      options.existingModelsOverride ??
        parseModelsString(options.channel?.models || '')
    ),
    redirects: normalizeModelList(options.redirectModels ?? []),
    redirectSources: new Set(
      normalizeModelList(options.redirectSourceModels ?? [])
    ),
  }))
  const [selectedModels, setSelectedModels] = useState(initial.existing)
  const [searchKeyword, setSearchKeyword] = useState('')
  const [selectedTypes, setSelectedTypes] = useState(() => [
    ...useFetchModelPreferences.getState().types,
  ])
  const [chosenTab, setTab] = useState<FetchModelsTab | null>(null)

  const query = useQuery({
    // Each picker owns its request, including two editors for the same channel.
    queryKey: ['channel-model-fetch', sessionId],
    enabled: !!(options.channel || options.customFetcher),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      if (options.customFetcher) {
        return normalizeModelList(await options.customFetcher())
      }
      if (!options.channel) return []
      const response = await fetchUpstreamModels(options.channel.id)
      if (!response.success) {
        throw new Error(response.message || t('Failed to fetch models'))
      }
      return normalizeModelList(
        Array.isArray(response.data) ? response.data : []
      )
    },
  })

  const entries = useMemo(() => {
    if (!query.data) return []
    const fetched = new Set(query.data)
    const categories = categorizeModelsWithRedirect(
      initial.existing,
      initial.redirects
    )
    const models: FetchedModel[] = query.data.map((id) => ({
      id,
      ...classifyModel(id),
      tab: categories.classificationSet.has(id) ? 'existing' : 'new',
      redirectOnly: categories.redirectOnlySet.has(id),
    }))
    // Keep removed entries in the session after unchecking so they can be restored.
    for (const id of initial.existing) {
      if (fetched.has(id) || initial.redirectSources.has(id)) continue
      models.push({
        id,
        ...classifyModel(id),
        tab: 'removed',
        redirectOnly: false,
      })
    }
    return models
  }, [query.data, initial])

  let defaultTab: FetchModelsTab = 'existing'
  if (entries.some((entry) => entry.tab === 'removed')) defaultTab = 'removed'
  if (entries.some((entry) => entry.tab === 'new')) defaultTab = 'new'
  const tab = chosenTab ?? defaultTab

  const searchedModels = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    return entries.filter((model) => model.id.toLowerCase().includes(keyword))
  }, [entries, searchKeyword])

  const typeCounts = useMemo(() => {
    const counts: Record<ModelType | 'all', number> = {
      all: 0,
      chat: 0,
      image: 0,
      video: 0,
      audio: 0,
      embedding: 0,
      rerank: 0,
      other: 0,
    }
    for (const model of searchedModels) {
      if (model.tab !== tab) continue
      counts.all++
      for (const type of model.types) counts[type]++
    }
    return counts
  }, [searchedModels, tab])

  const filtered = useMemo(() => {
    const counts: Record<FetchModelsTab, number> = {
      new: 0,
      existing: 0,
      removed: 0,
    }
    const groups = new Map<string, FetchedModelGroup>()
    for (const model of searchedModels) {
      if (
        selectedTypes.length &&
        !model.types.some((type) => selectedTypes.includes(type))
      ) {
        continue
      }
      counts[model.tab]++
      if (model.tab !== tab) continue
      const vendorId = model.provider?.id ?? 'other'
      let group = groups.get(vendorId)
      if (!group) {
        group = { provider: model.provider, models: [] }
        groups.set(vendorId, group)
      }
      group.models.push(model)
    }
    return {
      counts,
      groups: [...groups.values()].sort((a, b) => {
        if (!a.provider) return b.provider ? 1 : 0
        if (!b.provider) return -1
        return a.provider.name.localeCompare(b.provider.name, 'en', {
          sensitivity: 'base',
        })
      }),
    }
  }, [searchedModels, selectedTypes, tab])

  const selectedSet = useMemo(() => new Set(selectedModels), [selectedModels])

  function changeTypes(types: readonly ModelType[]) {
    const next = MODEL_TYPES.filter((type) => types.includes(type))
    setSelectedTypes(next)
    useFetchModelPreferences.getState().setTypes(next)
  }

  function toggleModels(models: readonly string[], checked: boolean) {
    setSelectedModels((previous) => {
      const next = new Set(previous)
      for (const model of models) {
        if (checked) next.add(model)
        else next.delete(model)
      }
      return [...next]
    })
  }

  function clearFilters() {
    setSearchKeyword('')
    changeTypes([])
  }

  return {
    query,
    selectedModels,
    selectedSet,
    toggleModels,
    searchKeyword,
    setSearchKeyword,
    selectedTypes,
    changeTypes,
    clearFilters,
    tab,
    setTab,
    typeCounts,
    tabCounts: filtered.counts,
    groups: filtered.groups,
    hasModels: entries.length > 0,
    hasRemovedModels: entries.some((entry) => entry.tab === 'removed'),
  }
}
