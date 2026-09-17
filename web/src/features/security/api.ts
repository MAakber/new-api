import type { TwoFAStatus } from '@/features/profile/types'
import { api } from '@/lib/api'
import {
  AuthOperationError,
  authRequestOptions,
  authResult,
} from '@/lib/secure-verification'

export interface AccessTokenStatus {
  exists: boolean
  token_ref: string
  created_at: number | null
  last_used_at: number | null
  last_used_ip: string
}

export function getAccessTokenStatus(): Promise<AccessTokenStatus> {
  return authResult(
    api.get('/api/user/token/status', authRequestOptions),
    'Failed to load token status'
  )
}

export async function createAccessToken(
  proofToken: string,
  signal: AbortSignal
): Promise<string> {
  const token = await authResult<string>(
    api.post('/api/user/token', undefined, {
      ...authRequestOptions,
      headers: { 'X-Security-Proof': proofToken },
      singleUseAuthorization: true,
      signal,
    }),
    'Failed to generate token'
  )
  if (!token) throw new AuthOperationError('Failed to generate token')
  return token
}

export async function revokeAccessToken(
  proofToken: string,
  signal: AbortSignal
): Promise<void> {
  await authResult<null>(
    api.delete('/api/user/token', {
      ...authRequestOptions,
      headers: { 'X-Security-Proof': proofToken },
      singleUseAuthorization: true,
      signal,
    }),
    'Failed to revoke token'
  )
}

export interface TwoFASetupData {
  secret: string
  qr_code_data: string
  backup_codes: string[]
  flow_token: string
  expires_at: number
}

export function get2FAStatus(): Promise<TwoFAStatus> {
  return authResult(api.get('/api/user/2fa/status', authRequestOptions))
}

export function setup2FA(
  proofToken: string,
  signal: AbortSignal
): Promise<TwoFASetupData> {
  return authResult(
    api.post('/api/user/2fa/setup', undefined, {
      ...authRequestOptions,
      signal,
      headers: { 'X-Security-Proof': proofToken },
    })
  )
}

export function enable2FA(
  code: string,
  flowToken: string,
  signal: AbortSignal
): Promise<unknown> {
  return authResult(
    api.post(
      '/api/user/2fa/enable',
      { code, flow_token: flowToken },
      {
        ...authRequestOptions,
        signal,
        acceptAuthRotation: true,
        singleUseAuthorization: true,
      }
    )
  )
}
