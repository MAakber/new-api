import { api } from '@/lib/api'

import type { AboutResponse } from './types'

export async function getAboutContent(): Promise<AboutResponse> {
  // See getNotice in @/lib/api: the global `Cache-Control: no-store` is dropped
  // so the browser can hold an ETag and revalidate, letting the server answer
  // 304. Server-side `no-cache` keeps admin edits immediate.
  const res = await api.get<AboutResponse>('/api/about', {
    headers: { 'Cache-Control': null },
  })
  return res.data
}
