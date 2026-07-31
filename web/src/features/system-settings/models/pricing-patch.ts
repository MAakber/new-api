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
import type {
  PricingOptionKey,
  PricingPatchOperation,
  PricingPatchValue,
  SystemOption,
} from '../types'

export const PRICING_OPTION_KEYS = [
  'ModelPrice',
  'ModelRatio',
  'CacheRatio',
  'CreateCacheRatio',
  'CompletionRatio',
  'ImageRatio',
  'AudioRatio',
  'AudioCompletionRatio',
  'billing_setting.billing_mode',
  'billing_setting.billing_expr',
] as const satisfies readonly PricingOptionKey[]

export type PricingOptionMaps = Partial<Record<PricingOptionKey, string>>

type PricingMap = Record<string, PricingPatchValue>

function parsePricingMap(raw: string | undefined): PricingMap {
  if (!raw) return {}
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || Array.isArray(value) || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, PricingPatchValue] =>
          typeof entry[1] === 'number' || typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export function getPricingOptionMaps(options: SystemOption[] | undefined) {
  const pricingMaps: PricingOptionMaps = {}
  for (const option of options ?? []) {
    if ((PRICING_OPTION_KEYS as readonly string[]).includes(option.key)) {
      pricingMaps[option.key as PricingOptionKey] = option.value
    }
  }
  return pricingMaps
}

// Builds optimistic-concurrency operations from complete JSON maps. `hasOwn`
// intentionally distinguishes a missing model from a configured value of 0.
export function buildPricingPatchOperations(
  previous: PricingOptionMaps,
  draft: PricingOptionMaps
): PricingPatchOperation[] {
  const operations: PricingPatchOperation[] = []

  for (const key of PRICING_OPTION_KEYS) {
    const previousMap = parsePricingMap(previous[key])
    const draftMap = parsePricingMap(draft[key])
    const models = new Set([
      ...Object.keys(previousMap),
      ...Object.keys(draftMap),
    ])

    for (const model of models) {
      const wasPresent = Object.hasOwn(previousMap, model)
      const isPresent = Object.hasOwn(draftMap, model)
      const previousValue = previousMap[model]
      const draftValue = draftMap[model]

      if (wasPresent === isPresent && previousValue === draftValue) continue

      operations.push({
        key,
        model,
        action: isPresent ? 'set' : 'delete',
        ...(isPresent ? { value: draftValue } : {}),
        expected: {
          present: wasPresent,
          ...(wasPresent ? { value: previousValue } : {}),
        },
      })
    }
  }

  return operations
}

export function isPricingPatchConflict(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    (error as { response?: { status?: number } }).response?.status === 409
  )
}
