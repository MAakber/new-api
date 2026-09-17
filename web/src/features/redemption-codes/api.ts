import { api } from '@/lib/api'

import type {
  Redemption,
  ApiResponse,
  GetRedemptionsParams,
  GetRedemptionsResponse,
  SearchRedemptionsParams,
  RedemptionFormData,
  ExportRedemptionsRequest,
} from './types'

// ============================================================================
// Redemption Code Management
// ============================================================================

// Get paginated redemption codes list
export async function getRedemptions(
  params: GetRedemptionsParams = {}
): Promise<GetRedemptionsResponse> {
  const { p = 1, page_size = 10 } = params
  const res = await api.get(`/api/redemption/?p=${p}&page_size=${page_size}`)
  return res.data
}

// Search redemption codes by keyword
export async function searchRedemptions(
  params: SearchRedemptionsParams
): Promise<GetRedemptionsResponse> {
  const { keyword = '', status = '', p = 1, page_size = 10 } = params
  const queryParams = new URLSearchParams()
  queryParams.set('keyword', keyword)
  if (status) queryParams.set('status', status)
  queryParams.set('p', String(p))
  queryParams.set('page_size', String(page_size))
  const res = await api.get(`/api/redemption/search?${queryParams.toString()}`)
  return res.data
}

// Get single redemption code by ID
export async function getRedemption(
  id: number
): Promise<ApiResponse<Redemption>> {
  const res = await api.get(`/api/redemption/${id}`)
  return res.data
}

// Create redemption code(s)
export async function createRedemption(
  data: RedemptionFormData
): Promise<ApiResponse<string[]>> {
  const res = await api.post('/api/redemption/', data)
  return res.data
}

// Update redemption code
export async function updateRedemption(
  data: RedemptionFormData & { id: number }
): Promise<ApiResponse<Redemption>> {
  const res = await api.put('/api/redemption/', data)
  return res.data
}

// Update redemption code status (enable/disable)
export async function updateRedemptionStatus(
  id: number,
  status: number
): Promise<ApiResponse<Redemption>> {
  const res = await api.put('/api/redemption/?status_only=true', { id, status })
  return res.data
}

// Delete a single redemption code
export async function deleteRedemption(id: number): Promise<ApiResponse> {
  const res = await api.delete(`/api/redemption/${id}/`)
  return res.data
}

// Delete invalid redemption codes (used, disabled, expired)
export async function deleteInvalidRedemptions(): Promise<ApiResponse<number>> {
  const res = await api.delete('/api/redemption/invalid')
  return res.data
}

export async function exportRedemptions(
  data: ExportRedemptionsRequest
): Promise<void> {
  const res = await api.post('/api/redemption/export', data, {
    responseType: 'blob',
  })
  const contentType = String(res.headers['content-type'] || '')
  if (!contentType.includes('text/csv')) {
    const text = await (res.data as Blob).text()
    let message = 'Failed to export redemption codes'
    try {
      const payload = JSON.parse(text) as ApiResponse
      message = payload.message || message
    } catch {
      // Keep the stable fallback when the server does not return JSON.
    }
    throw new Error(message)
  }
  const disposition = String(res.headers['content-disposition'] || '')
  const filenameMatch = disposition.match(/filename="?([^";]+)"?/i)
  const filename = filenameMatch?.[1] || 'redemption-codes.csv'
  const url = URL.createObjectURL(res.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function batchDeleteRedemptions(
  ids: number[]
): Promise<ApiResponse<number>> {
  const res = await api.post('/api/redemption/batch', { ids })
  return res.data
}
