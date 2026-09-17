import { t } from 'i18next'

import type { ApiResponse } from '@/features/profile/types'
import { api } from '@/lib/api'
import { createServerError } from '@/lib/server-error-message'

export interface AuditLog {
  event_id: string
  user_id: number
  username: string
  actor_role: number
  created_at: number
  category: string
  action: string
  token_ref: string
  auth_method?: string
  ip: string
  user_agent: string
  method: string
  route: string
  status: number
  success: boolean
  request_id: string
  content: string
  other: Record<string, unknown> | null
}
export interface AuditFilters {
  p: number
  page_size: number
  start_timestamp?: number
  end_timestamp?: number
  success?: string
  category?: string
  token_ref?: string
  exclude_token_ref?: string
  username?: string
  request_id?: string
}
export async function getAuditLogs(
  scope: 'all' | 'self',
  params: AuditFilters
): Promise<{ items: AuditLog[]; total: number }> {
  const response = await api.get<
    ApiResponse<{ items: AuditLog[]; total: number }>
  >(scope === 'all' ? '/api/audit' : '/api/audit/self', { params })
  if (!response.data.success || !response.data.data) {
    throw createServerError(response.data, t('Failed to load audit records'))
  }
  return response.data.data
}
