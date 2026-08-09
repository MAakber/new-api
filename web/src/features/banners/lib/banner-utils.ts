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

import {
  BANNER_TYPES,
  type Banner,
  type BannerFormValues,
  type BannerType,
  type BannerWritePayload,
  type CreateBannerPayload,
  type UpdateBannerPayload,
} from '../types'

export const BANNER_SORT_ORDER_MIN = -2147483648
export const BANNER_SORT_ORDER_MAX = 2147483647

export const BANNER_TYPE_OPTIONS: Array<{
  value: BannerType
  labelKey: string
  color: string
  badgeVariant: 'neutral' | 'info' | 'success' | 'warning' | 'danger'
}> = [
  {
    value: 'default',
    labelKey: 'Default',
    color: 'bg-gray-500',
    badgeVariant: 'neutral',
  },
  {
    value: 'ongoing',
    labelKey: 'Ongoing',
    color: 'bg-blue-500',
    badgeVariant: 'info',
  },
  {
    value: 'success',
    labelKey: 'Success',
    color: 'bg-green-500',
    badgeVariant: 'success',
  },
  {
    value: 'warning',
    labelKey: 'Warning',
    color: 'bg-orange-500',
    badgeVariant: 'warning',
  },
  {
    value: 'error',
    labelKey: 'Error',
    color: 'bg-red-500',
    badgeVariant: 'danger',
  },
]

function hashString(input: string): string {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  return hash.toString(36)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeOptionalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && !Number.isNaN(Date.parse(trimmed)) ? trimmed : null
}

function normalizeSortOrder(value: unknown): number {
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= BANNER_SORT_ORDER_MIN &&
    value <= BANNER_SORT_ORDER_MAX
  ) {
    return value
  }

  return 0
}

/**
 * Normalize API data at the feature boundary so public and admin surfaces
 * remain safe when older records contain missing or unexpected values.
 */
export function normalizeBanner(value: unknown, index = 0): Banner {
  const item = isRecord(value) ? value : {}
  const itemType = item.type as BannerType
  const type = BANNER_TYPES.includes(itemType) ? itemType : 'default'

  return {
    id:
      typeof item.id === 'number' && Number.isFinite(item.id)
        ? item.id
        : index + 1,
    content: typeof item.content === 'string' ? item.content : '',
    publishDate: typeof item.publishDate === 'string' ? item.publishDate : '',
    type,
    extra: typeof item.extra === 'string' ? item.extra : '',
    enabled: item.enabled !== false,
    sortOrder: normalizeSortOrder(item.sortOrder),
    startDate: normalizeOptionalDate(item.startDate),
    endDate: normalizeOptionalDate(item.endDate),
    link: typeof item.link === 'string' ? item.link.trim() : '',
  }
}

/**
 * The public endpoint already returns visible records. This second guard keeps
 * the decorative banner safe if an older server returns a stale record.
 */
export function isBannerCurrentlyVisible(banner: Banner): boolean {
  if (banner.enabled === false || !banner.content.trim()) return false

  const now = Date.now()
  if (banner.startDate) {
    const start = Date.parse(banner.startDate)
    if (Number.isNaN(start) || now < start) return false
  }
  if (banner.endDate) {
    const end = Date.parse(banner.endDate)
    if (Number.isNaN(end) || now > end) return false
  }

  return true
}

/**
 * Only HTTP and HTTPS links are allowed in public banner content.
 */
export function getSafeBannerLink(link?: string | null): string | undefined {
  const value = link?.trim()
  if (!value) return undefined

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    return value
  } catch {
    return undefined
  }
}

/**
 * A content-aware version makes a dismissed banner set reappear after edits.
 */
export function getBannerSetVersion(banners: readonly Banner[]): string {
  const fingerprint = JSON.stringify(
    banners.map((banner) => ({
      id: banner.id,
      content: banner.content,
      publishDate: banner.publishDate,
      type: banner.type,
      extra: banner.extra,
      enabled: banner.enabled,
      sortOrder: banner.sortOrder,
      startDate: banner.startDate ?? '',
      endDate: banner.endDate ?? '',
      link: banner.link,
    }))
  )

  return hashString(fingerprint)
}

export function formatBannerDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString()
}

export function getDefaultBannerValues(): BannerFormValues {
  return {
    content: '',
    publishDate: new Date().toISOString(),
    type: 'default',
    extra: '',
    enabled: true,
    sortOrder: 0,
    startDate: '',
    endDate: '',
    link: '',
  }
}

export function toBannerPayload(values: BannerFormValues): CreateBannerPayload
export function toBannerPayload(
  values: BannerFormValues,
  id: number
): UpdateBannerPayload
export function toBannerPayload(
  values: BannerFormValues,
  id?: number
): BannerWritePayload {
  const payload: BannerWritePayload = {
    content: values.content,
    publishDate: new Date(values.publishDate).toISOString(),
    type: values.type,
    extra: values.extra,
    enabled: values.enabled,
    sortOrder: values.sortOrder,
    startDate: values.startDate
      ? new Date(values.startDate).toISOString()
      : null,
    endDate: values.endDate ? new Date(values.endDate).toISOString() : null,
    link: values.link.trim(),
  }

  if (id !== undefined) payload.id = id
  return payload
}
