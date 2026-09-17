import { api } from '@/lib/api'

import type {
  RankingAvailabilitySnapshot,
  RankingBanSort,
  RankingPeriod,
  RankingSecuritySnapshot,
  RankingsSnapshot,
} from './types'

type RankingsResponse = {
  success: boolean
  message?: string
  data: RankingsSnapshot
}

export async function getRankings(
  period: RankingPeriod
): Promise<RankingsResponse> {
  const res = await api.get('/api/rankings', { params: { period } })
  return res.data
}

export async function getRankingAvailability(period: RankingPeriod): Promise<{
  success: boolean
  message?: string
  data: RankingAvailabilitySnapshot
}> {
  const res = await api.get('/api/rankings/availability', {
    params: { period },
  })
  return res.data
}

export async function getRankingSecurity(
  period: RankingPeriod,
  banSort: RankingBanSort
): Promise<{
  success: boolean
  message?: string
  data: RankingSecuritySnapshot
}> {
  const res = await api.get('/api/rankings/security', {
    params: { period, ban_sort: banSort },
  })
  return res.data
}
