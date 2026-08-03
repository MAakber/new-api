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
import type { TFunction } from 'i18next'
import { z } from 'zod'

import { parseQuotaFromDollars, quotaUnitsToDollars } from '@/lib/format'

import {
  REDEMPTION_VALIDATION,
  getRedemptionFormErrorMessages,
} from '../constants'
import {
  REDEMPTION_REWARD_TYPE,
  REDEMPTION_CODE_TYPE,
  type RedemptionCodeType,
  type RedemptionFormData,
  type Redemption,
  type RedemptionRewardType,
} from '../types'

// ============================================================================
// Form Schema (use getRedemptionFormSchema(t) in components for i18n messages)
// ============================================================================

export function getRedemptionFormSchema(t: TFunction) {
  const msg = getRedemptionFormErrorMessages(t)
  return z
    .object({
      name: z
        .string()
        .min(REDEMPTION_VALIDATION.NAME_MIN_LENGTH, msg.NAME_LENGTH_INVALID)
        .max(REDEMPTION_VALIDATION.NAME_MAX_LENGTH, msg.NAME_LENGTH_INVALID),
      reward_type: z.enum([
        REDEMPTION_REWARD_TYPE.QUOTA,
        REDEMPTION_REWARD_TYPE.SUBSCRIPTION,
      ]),
      code_type: z.enum([
        REDEMPTION_CODE_TYPE.REDEMPTION,
        REDEMPTION_CODE_TYPE.REGISTRATION,
      ]),
      quota_dollars: z.number().min(0, t('Quota must be a positive number')),
      plan_id: z.number().int().min(0),
      max_uses: z.number().int().min(1, t('Usage limit must be at least 1')),
      expired_time: z.date().optional(),
      count: z
        .number()
        .min(REDEMPTION_VALIDATION.COUNT_MIN, msg.COUNT_INVALID)
        .max(REDEMPTION_VALIDATION.COUNT_MAX, msg.COUNT_INVALID)
        .optional(),
    })
    .superRefine((data, context) => {
      if (
        data.code_type === REDEMPTION_CODE_TYPE.REDEMPTION &&
        data.reward_type === REDEMPTION_REWARD_TYPE.SUBSCRIPTION &&
        data.plan_id <= 0
      ) {
        context.addIssue({
          code: 'custom',
          path: ['plan_id'],
          message: t('Please select a subscription plan'),
        })
      }
    })
}

export type RedemptionFormValues = {
  name: string
  code_type: RedemptionCodeType
  reward_type: RedemptionRewardType
  quota_dollars: number
  plan_id: number
  max_uses: number
  expired_time?: Date
  count?: number
}

// ============================================================================
// Form Defaults
// ============================================================================

export const REDEMPTION_FORM_DEFAULT_VALUES: RedemptionFormValues = {
  name: '',
  code_type: REDEMPTION_CODE_TYPE.REDEMPTION,
  reward_type: REDEMPTION_REWARD_TYPE.QUOTA,
  quota_dollars: 10,
  plan_id: 0,
  max_uses: 1,
  expired_time: undefined,
  count: 1,
}

// ============================================================================
// Form Data Transformation
// ============================================================================

/**
 * Transform form data to API payload
 */
export function transformFormDataToPayload(
  data: RedemptionFormValues
): RedemptionFormData {
  return {
    name: data.name,
    code_type: data.code_type,
    reward_type: data.reward_type,
    quota: parseQuotaFromDollars(data.quota_dollars),
    plan_id: data.plan_id,
    max_uses: data.max_uses,
    expired_time: data.expired_time
      ? Math.floor(data.expired_time.getTime() / 1000)
      : 0,
    count: data.count || 1,
  }
}

/**
 * Transform redemption data to form defaults
 */
export function transformRedemptionToFormDefaults(
  redemption: Redemption
): RedemptionFormValues {
  return {
    name: redemption.name,
    code_type: redemption.code_type,
    reward_type: redemption.reward_type,
    quota_dollars: quotaUnitsToDollars(redemption.quota),
    plan_id: redemption.plan_id,
    max_uses: redemption.max_uses,
    expired_time:
      redemption.expired_time > 0
        ? new Date(redemption.expired_time * 1000)
        : undefined,
    count: 1,
  }
}
