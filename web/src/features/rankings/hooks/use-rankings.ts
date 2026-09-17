import { useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getRankingAvailability, getRankings, getRankingSecurity } from '../api'
import type { RankingBanSort, RankingPeriod } from '../types'

export function useRankings(period: RankingPeriod) {
  return useQuery({
    queryKey: ['rankings', period],
    queryFn: async () => requireServerSuccess(await getRankings(period)),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRankingAvailability(period: RankingPeriod) {
  return useQuery({
    queryKey: ['rankings-availability', period],
    queryFn: async () =>
      requireServerSuccess(await getRankingAvailability(period)),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useRankingSecurity(
  period: RankingPeriod,
  banSort: RankingBanSort,
  isAdmin: boolean
) {
  return useQuery({
    queryKey: ['rankings-security', period, banSort, isAdmin],
    queryFn: async () =>
      requireServerSuccess(await getRankingSecurity(period, banSort)),
    staleTime: 60 * 1000,
  })
}
