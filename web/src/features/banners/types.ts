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

export const BANNER_TYPES = [
  'default',
  'ongoing',
  'success',
  'warning',
  'error',
] as const

export type BannerType = (typeof BANNER_TYPES)[number]

export type Banner = {
  id: number
  content: string
  publishDate: string
  type: BannerType
  extra: string
  enabled: boolean
  sortOrder: number
  startDate: string | null
  endDate: string | null
  link: string
}

export type BannerFormValues = {
  content: string
  publishDate: string
  type: BannerType
  extra: string
  enabled: boolean
  sortOrder: number
  startDate: string
  endDate: string
  link: string
}

export type BannerWritePayload = Omit<Banner, 'id'> & {
  id?: number
}

export type CreateBannerPayload = Omit<BannerWritePayload, 'id'>

export type UpdateBannerPayload = BannerWritePayload & {
  id: number
}

export type BannerListResponse = {
  success: boolean
  message: string
  data: Banner[]
}

export type BannerMutationResponse = {
  success: boolean
  message: string
  data?: Banner
}
