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

import type {
  CustomBalanceAuthType,
  CustomBalanceProvider,
  CustomBalanceSettings,
  CustomBalanceUpdatePayload,
} from '../types'

export const CUSTOM_BALANCE_PROVIDERS = [
  'new_api',
  'one_api',
  'veloera',
  'anyrouter',
] as const

export const CUSTOM_BALANCE_DEFAULT_VALUES = {
  enabled: false,
  provider: 'new_api' as const,
  use_channel_key: true,
  auth_type: 'token' as const,
  credential: '',
  user_id: '',
  quota_per_unit: 500000,
  auto_balance: false,
  auto_checkin: false,
  balance_interval_seconds: 3600,
  checkin_interval_seconds: 86400,
  retry_max_attempts: 3,
  retry_interval_seconds: 300,
}

export type CustomBalanceFormValues = {
  enabled: boolean
  provider: CustomBalanceProvider
  use_channel_key: boolean
  auth_type: CustomBalanceAuthType
  credential: string
  user_id: string
  quota_per_unit: number
  auto_balance: boolean
  auto_checkin: boolean
  balance_interval_seconds: number
  checkin_interval_seconds: number
  retry_max_attempts: number
  retry_interval_seconds: number
}

export const customBalanceFormSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(CUSTOM_BALANCE_PROVIDERS),
  use_channel_key: z.boolean(),
  auth_type: z.enum(['token', 'cookie']),
  credential: z.string(),
  user_id: z.string(),
  quota_per_unit: z
    .number()
    .finite('Quota must be a positive number')
    .positive('Quota must be a positive number'),
  auto_balance: z.boolean(),
  auto_checkin: z.boolean(),
  balance_interval_seconds: z
    .number()
    .int('Value must be a non-negative integer')
    .min(1, 'Value must be a non-negative integer'),
  checkin_interval_seconds: z
    .number()
    .int('Value must be a non-negative integer')
    .min(1, 'Value must be a non-negative integer'),
  retry_max_attempts: z
    .number()
    .int('Value must be a non-negative integer')
    .min(1, 'Value must be a non-negative integer'),
  retry_interval_seconds: z
    .number()
    .int('Value must be a non-negative integer')
    .min(1, 'Value must be a non-negative integer'),
})

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const normalized = finiteNumber(value, fallback)
  return Number.isInteger(normalized) && normalized >= 0 ? normalized : fallback
}

function positiveInteger(value: unknown, fallback: number): number {
  const normalized = nonNegativeInteger(value, fallback)
  return normalized > 0 ? normalized : fallback
}

function positiveNumber(value: unknown, fallback: number): number {
  const normalized = finiteNumber(value, fallback)
  return normalized > 0 ? normalized : fallback
}

function normalizeUserID(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

function isCustomBalanceProvider(
  value: string
): value is CustomBalanceProvider {
  return CUSTOM_BALANCE_PROVIDERS.some((provider) => provider === value)
}

export function normalizeCustomBalanceSettings(
  settings?: Partial<CustomBalanceSettings> | null
): CustomBalanceSettings {
  return {
    enabled: settings?.enabled === true,
    provider:
      typeof settings?.provider === 'string' && settings.provider.trim()
        ? settings.provider
        : CUSTOM_BALANCE_DEFAULT_VALUES.provider,
    use_channel_key: settings?.use_channel_key !== false,
    auth_type: settings?.auth_type === 'cookie' ? 'cookie' : 'token',
    credential_set: settings?.credential_set === true,
    user_id: normalizeUserID(
      settings?.user_id,
      CUSTOM_BALANCE_DEFAULT_VALUES.user_id
    ),
    quota_per_unit: positiveNumber(
      settings?.quota_per_unit,
      CUSTOM_BALANCE_DEFAULT_VALUES.quota_per_unit
    ),
    auto_balance: settings?.auto_balance === true,
    auto_checkin: settings?.auto_checkin === true,
    balance_interval_seconds: positiveInteger(
      settings?.balance_interval_seconds,
      CUSTOM_BALANCE_DEFAULT_VALUES.balance_interval_seconds
    ),
    checkin_interval_seconds: positiveInteger(
      settings?.checkin_interval_seconds,
      CUSTOM_BALANCE_DEFAULT_VALUES.checkin_interval_seconds
    ),
    retry_max_attempts: nonNegativeInteger(
      settings?.retry_max_attempts ?? settings?.retry_max,
      CUSTOM_BALANCE_DEFAULT_VALUES.retry_max_attempts
    ),
    retry_interval_seconds: positiveInteger(
      settings?.retry_interval_seconds,
      CUSTOM_BALANCE_DEFAULT_VALUES.retry_interval_seconds
    ),
    next_balance_at: finiteTimestamp(settings?.next_balance_at),
    next_checkin_at: finiteTimestamp(settings?.next_checkin_at),
    last_balance_at: finiteTimestamp(settings?.last_balance_at),
    last_balance_status: stringOrNull(settings?.last_balance_status),
    last_balance_error: stringOrNull(settings?.last_balance_error),
    last_checkin_at: finiteTimestamp(settings?.last_checkin_at),
    last_checkin_status: stringOrNull(settings?.last_checkin_status),
    last_checkin_error: stringOrNull(settings?.last_checkin_error),
  }
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

/**
 * Build the independent custom-balance request without ever serializing a
 * credential returned by the server. An empty credential is intentionally
 * omitted so the backend preserves the existing secret.
 */
export function buildCustomBalancePayload(
  values: CustomBalanceFormValues
): CustomBalanceUpdatePayload {
  const payload: CustomBalanceUpdatePayload = {
    enabled: values.enabled,
    provider: values.provider,
    use_channel_key: values.use_channel_key,
    auth_type: values.auth_type,
    user_id: values.user_id,
    quota_per_unit: values.quota_per_unit,
    auto_balance: values.auto_balance,
    auto_checkin: values.auto_checkin,
    balance_interval_seconds: values.balance_interval_seconds,
    checkin_interval_seconds: values.checkin_interval_seconds,
    retry_max_attempts: values.retry_max_attempts,
    retry_interval_seconds: values.retry_interval_seconds,
  }

  const credential = values.credential.trim()
  if (!values.use_channel_key && credential) {
    payload.credential = credential
  }

  return payload
}

/**
 * Populate editable values from the server response. The response only
 * exposes credential_set; a credential value is never copied into the form.
 */
export function createCustomBalanceFormValues(
  settings?: Partial<CustomBalanceSettings> | null
): CustomBalanceFormValues {
  const normalized = normalizeCustomBalanceSettings(settings)
  return {
    enabled: normalized.enabled,
    provider: isCustomBalanceProvider(normalized.provider)
      ? normalized.provider
      : CUSTOM_BALANCE_DEFAULT_VALUES.provider,
    use_channel_key: normalized.use_channel_key,
    auth_type: normalized.auth_type,
    credential: '',
    user_id: normalized.user_id,
    quota_per_unit: normalized.quota_per_unit,
    auto_balance: normalized.auto_balance,
    auto_checkin: normalized.auto_checkin,
    balance_interval_seconds: normalized.balance_interval_seconds,
    checkin_interval_seconds: normalized.checkin_interval_seconds,
    retry_max_attempts: normalized.retry_max_attempts,
    retry_interval_seconds: normalized.retry_interval_seconds,
  }
}

export function getCustomBalanceStatusVariant(
  status: string | null | undefined
): 'secondary' | 'destructive' | 'outline' {
  const normalized = status?.trim().toLowerCase()
  if (
    normalized === 'success' ||
    normalized === 'ok' ||
    normalized === 'healthy'
  ) {
    return 'secondary'
  }
  if (
    normalized === 'failed' ||
    normalized === 'failure' ||
    normalized === 'error'
  ) {
    return 'destructive'
  }
  return 'outline'
}
