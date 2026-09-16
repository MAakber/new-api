import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { HistoryDays, OfficialSnapshot } from './types'

export function useOfficialStatus(days: HistoryDays) {
  return useQuery({
    queryKey: ['official-status', days],
    queryFn: async () => {
      // The shared client coalesces GETs; remounts must reuse an active request.
      const response = await api.get<{
        success: boolean
        message?: string
        data: OfficialSnapshot
      }>('/api/official-status', { params: { days } })
      return requireServerSuccess(response.data).data
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    meta: { errorToast: false },
  })
}
