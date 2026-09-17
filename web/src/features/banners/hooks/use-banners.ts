import { useQuery } from '@tanstack/react-query'

import { getAdminBanners, getPublicBanners } from '../api'

export const bannerQueryKeys = {
  public: ['banners', 'public'] as const,
  admin: ['banners', 'admin'] as const,
}

export function useBanners() {
  return useQuery({
    queryKey: bannerQueryKeys.public,
    queryFn: getPublicBanners,
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  })
}

export function useAdminBanners() {
  return useQuery({
    queryKey: bannerQueryKeys.admin,
    queryFn: getAdminBanners,
    staleTime: 0,
  })
}
