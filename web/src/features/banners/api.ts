import { api } from '@/lib/api'

import { normalizeBanner } from './lib/banner-utils'
import type {
  Banner,
  BannerListResponse,
  BannerMutationResponse,
  BannerWritePayload,
  UpdateBannerPayload,
} from './types'

function getBannerList(response: BannerListResponse): Banner[] {
  if (!response.success || !Array.isArray(response.data)) {
    return []
  }

  return response.data.map((banner, index) => normalizeBanner(banner, index))
}

function ensureMutationSuccess(response: BannerMutationResponse) {
  if (!response.success) {
    throw new Error(response.message || 'Banner request failed')
  }

  return response
}

/** Public, unauthenticated banner feed. */
export async function getPublicBanners(): Promise<Banner[]> {
  const response = await api.get<BannerListResponse>('/api/banners', {
    skipBusinessError: true,
    skipErrorHandler: true,
  })

  return getBannerList(response.data)
}

/** Admin banner feed, including disabled and out-of-window records. */
export async function getAdminBanners(): Promise<Banner[]> {
  const response = await api.get<BannerListResponse>('/api/banner')
  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to load banners')
  }

  return getBannerList(response.data)
}

export async function createBanner(payload: BannerWritePayload) {
  const response = await api.post<BannerMutationResponse>(
    '/api/banner',
    payload
  )
  return ensureMutationSuccess(response.data)
}

export async function updateBanner(payload: UpdateBannerPayload) {
  const response = await api.put<BannerMutationResponse>(
    `/api/banner/${payload.id}`,
    payload
  )
  return ensureMutationSuccess(response.data)
}

export async function deleteBanner(id: number) {
  const response = await api.delete<BannerMutationResponse>(`/api/banner/${id}`)
  return ensureMutationSuccess(response.data)
}
