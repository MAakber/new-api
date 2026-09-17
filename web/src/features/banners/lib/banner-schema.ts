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
