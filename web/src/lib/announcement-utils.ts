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
import type { AnnouncementItem } from '@/features/dashboard/types'

function hashString(input: string): string {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Build a compact version for the currently visible announcement set.
 * Content and lifecycle fields are included so edits can bring a dismissed
 * banner back without requiring a new backend endpoint.
 */
export function getAnnouncementSetVersion(
  announcements: readonly AnnouncementItem[]
): string {
  const fingerprint = JSON.stringify(
    announcements.map((announcement) => ({
      id: announcement.id ?? null,
      content: announcement.content,
      publishDate: announcement.publishDate ?? '',
      type: announcement.type ?? 'default',
      extra: announcement.extra ?? '',
      enabled: announcement.enabled ?? true,
      sortOrder: announcement.sortOrder ?? null,
      startDate: announcement.startDate ?? '',
      endDate: announcement.endDate ?? '',
      link: announcement.link ?? '',
    }))
  )

  return hashString(fingerprint)
}

/**
 * Only allow the URL schemes accepted by the announcement settings contract.
 */
export function getSafeAnnouncementLink(link?: string): string | undefined {
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
