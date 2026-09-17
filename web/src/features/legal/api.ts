import { api } from '@/lib/api'

import type { LegalDocumentResponse } from './types'

// Both documents drop the client's global `Cache-Control: no-store` for the
// same reason as getNotice in @/lib/api: `no-store` stops the browser from
// keeping a copy, so it would never hold an ETag to revalidate with and the
// server could never answer 304. These are the largest payloads in this family
// and are re-fetched on every sign-up, so the saving is the most visible here.
export async function getUserAgreement(): Promise<LegalDocumentResponse> {
  const res = await api.get<LegalDocumentResponse>('/api/user-agreement', {
    headers: { 'Cache-Control': null },
  })
  return res.data
}

export async function getPrivacyPolicy(): Promise<LegalDocumentResponse> {
  const res = await api.get<LegalDocumentResponse>('/api/privacy-policy', {
    headers: { 'Cache-Control': null },
  })
  return res.data
}
