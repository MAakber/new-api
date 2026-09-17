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
