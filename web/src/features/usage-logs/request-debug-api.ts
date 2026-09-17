import { api } from '@/lib/api'

export async function getRequestDebugBody(requestId: string) {
  const res = await api.get(
    `/api/log/${encodeURIComponent(requestId)}/request-body`
  )
  return res.data as {
    success: boolean
    message: string
    data?: {
      body?: string
      body_encoding?: string
      body_truncated?: boolean
      body_bytes?: number
      stored_bytes?: number
      content_type?: string
      compression?: string
    }
  }
}
