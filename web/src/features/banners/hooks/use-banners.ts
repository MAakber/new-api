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
