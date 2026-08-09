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
import { z } from 'zod'

import {
  type PermissionCatalog,
  type AdminPermissionMatrix,
  normalizeAdminPermissions,
} from '@/lib/admin-permissions'
import { quotaUnitsToDollars } from '@/lib/format'
import { ROLE } from '@/lib/roles'

import { DEFAULT_GROUP } from '../constants'
import type { User, UserFormData } from '../types'

export const USER_REQUEST_RATE_LIMIT_MAX = 1_000_000

export const USER_REQUEST_RATE_LIMIT_MODES = [
  'default',
  'unlimited',
  'custom',
] as const

export type UserRequestRateLimitMode =
  (typeof USER_REQUEST_RATE_LIMIT_MODES)[number]

export function getUserRequestRateLimitMode(
  requestsPerMinute: number | null | undefined
): UserRequestRateLimitMode {
  if (requestsPerMinute === 0) return 'unlimited'
  if (typeof requestsPerMinute === 'number' && requestsPerMinute > 0) {
    return 'custom'
  }
  return 'default'
}

export function getRequestsPerMinuteForMode(
  mode: UserRequestRateLimitMode,
  requestsPerMinute: number | '' | null
): number | null {
  if (mode === 'default') return null
  if (mode === 'unlimited') return 0
  return typeof requestsPerMinute === 'number' ? requestsPerMinute : null
}

// ============================================================================
// Form Schema
// ============================================================================

export const userFormSchema = z
  .object({
    username: z.string().min(1, 'Username is required'),
    display_name: z.string().optional(),
    password: z.string().optional(),
    role: z.number().optional(),
    quota_dollars: z.number().min(0).optional(),
    group: z.string().optional(),
    remark: z.string().optional(),
    rpm_mode: z.enum(USER_REQUEST_RATE_LIMIT_MODES),
    requests_per_minute: z.number().or(z.literal('')).nullable(),
    admin_permissions: z
      .record(z.string(), z.record(z.string(), z.boolean()))
      .optional(),
  })
  .superRefine((data, context) => {
    if (data.rpm_mode !== 'custom') return

    const value = data.requests_per_minute
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > USER_REQUEST_RATE_LIMIT_MAX
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['requests_per_minute'],
        message: 'Enter a whole number from 1 to 1,000,000.',
      })
    }
  })

export type UserFormValues = z.infer<typeof userFormSchema>

// ============================================================================
// Form Defaults
// ============================================================================

export const USER_FORM_DEFAULT_VALUES: UserFormValues = {
  username: '',
  display_name: '',
  password: '',
  role: 1, // Default to common user
  quota_dollars: 0,
  group: DEFAULT_GROUP,
  remark: '',
  rpm_mode: 'default',
  requests_per_minute: null,
  // Filled against the backend catalog at render time; see UsersMutateDrawer.
  admin_permissions: {},
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: UserFormValues,
  userId?: number,
  catalog?: PermissionCatalog
): UserFormData & { id?: number } {
  const payload: UserFormData & { id?: number } = {
    username: data.username,
    display_name: data.display_name || data.username,
    password: data.password || undefined,
  }

  const role = userId === undefined ? data.role || 1 : (data.role ?? 0)

  // Only send the permission matrix when the target is an admin and the catalog
  // is available; without the catalog we cannot build a full matrix, so we omit
  // the field (the backend then leaves existing permissions untouched).
  if (role >= ROLE.ADMIN && catalog) {
    payload.admin_permissions = normalizeAdminPermissions(
      data.admin_permissions as AdminPermissionMatrix | undefined,
      catalog
    )
  }

  // For create: only send required fields
  if (userId === undefined) {
    payload.role = role
  } else {
    // For update: quota is adjusted atomically via /api/user/manage, not sent here
    payload.group = data.group
    payload.remark = data.remark || undefined
    payload.requests_per_minute = getRequestsPerMinuteForMode(
      data.rpm_mode,
      data.requests_per_minute
    )
    payload.id = userId
  }

  return payload
}

/**
 * Transform user data to form defaults. The admin permission matrix is passed
 * through as-is (the backend already returns a full matrix); it is filled against
 * the catalog at render time in UsersMutateDrawer.
 */
export function transformUserToFormDefaults(user: User): UserFormValues {
  const requestsPerMinute = user.requests_per_minute ?? null

  return {
    username: user.username,
    display_name: user.display_name,
    password: '',
    role: user.role,
    quota_dollars: quotaUnitsToDollars(user.quota),
    group: user.group || DEFAULT_GROUP,
    remark: user.remark || '',
    rpm_mode: getUserRequestRateLimitMode(requestsPerMinute),
    requests_per_minute: requestsPerMinute,
    admin_permissions: user.admin_permissions ?? {},
  }
}
