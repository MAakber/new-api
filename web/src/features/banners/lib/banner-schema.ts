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
import * as z from 'zod'

import { BANNER_TYPES } from '../types'
import {
  BANNER_SORT_ORDER_MAX,
  BANNER_SORT_ORDER_MIN,
  getSafeBannerLink,
} from './banner-utils'

function isValidOptionalDate(value: string): boolean {
  return value === '' || !Number.isNaN(Date.parse(value))
}

export function createBannerSchema(t: TFunction) {
  return z
    .object({
      content: z
        .string()
        .min(1, t('Content is required'))
        .max(500, t('Content must be less than 500 characters')),
      publishDate: z
        .string()
        .min(1, t('Publish date is required'))
        .refine(
          (value) => !Number.isNaN(Date.parse(value)),
          t('Publish date must be a valid date')
        ),
      type: z.enum(BANNER_TYPES),
      extra: z.string().max(200, t('Extra must be less than 200 characters')),
      enabled: z.boolean(),
      sortOrder: z
        .number()
        .int(t('Sort order must be a whole number'))
        .min(
          BANNER_SORT_ORDER_MIN,
          t('Sort order is below the supported minimum')
        )
        .max(
          BANNER_SORT_ORDER_MAX,
          t('Sort order is above the supported maximum')
        ),
      startDate: z
        .string()
        .refine(isValidOptionalDate, t('Start date must be a valid date')),
      endDate: z
        .string()
        .refine(isValidOptionalDate, t('End date must be a valid date')),
      link: z
        .string()
        .max(500, t('Link must be less than 500 characters'))
        .refine(
          (value) => value === '' || Boolean(getSafeBannerLink(value)),
          t('Link must be a valid HTTP or HTTPS URL')
        ),
    })
    .superRefine((values, context) => {
      if (!values.startDate || !values.endDate) return

      if (Date.parse(values.startDate) > Date.parse(values.endDate)) {
        context.addIssue({
          code: 'custom',
          message: t('Start date cannot be later than end date'),
          path: ['endDate'],
        })
      }
    })
}
