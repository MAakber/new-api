import { api } from '@/lib/api'
import { authRequestOptions, authResult } from '@/lib/secure-verification'

import type {
  SecurityProof,
  VerificationOperation,
} from '../secure-verification/types'
import type {
  ApiResponse,
  PasskeyCredentialList,
  PasskeyOptionsPayload,
  PasskeyStatus,
} from './types'

function proofHeaders(proofToken?: string): Record<string, string> | undefined {
  return proofToken ? { 'X-Security-Proof': proofToken } : undefined
}

export async function getPasskeyStatus(): Promise<ApiResponse<PasskeyStatus>> {
  const res = await api.get<ApiResponse<PasskeyStatus>>('/api/user/passkey')
  return res.data
}

export async function getPasskeys(): Promise<
  ApiResponse<PasskeyCredentialList>
> {
  const res =
    await api.get<ApiResponse<PasskeyCredentialList>>('/api/user/passkeys')
  return res.data
}

export function beginPasskeyRegistration(
  displayName: string,
  proofToken: string,
  signal?: AbortSignal
): Promise<PasskeyOptionsPayload> {
  return authResult(
    api.post(
      '/api/user/passkey/register/begin',
      { display_name: displayName },
      {
        ...authRequestOptions,
        headers: proofHeaders(proofToken),
        signal,
      }
    )
  )
}

export function finishPasskeyRegistration(
  flowToken: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<unknown> {
  return authResult(
    api.post(
      '/api/user/passkey/register/finish',
      { flow_token: flowToken, credential: payload },
      {
        ...authRequestOptions,
        acceptAuthRotation: true,
        singleUseAuthorization: true,
        signal,
      }
    )
  )
}

export function deletePasskey(
  proofToken: string,
  signal?: AbortSignal
): Promise<unknown> {
  return authResult(
    api.delete('/api/user/passkey', {
      ...authRequestOptions,
      headers: proofHeaders(proofToken),
      acceptAuthRotation: true,
      signal,
    })
  )
}

export function deletePasskeyById(
  id: number,
  proofToken: string,
  signal?: AbortSignal
): Promise<unknown> {
  return authResult(
    api.delete(`/api/user/passkeys/${id}`, {
      ...authRequestOptions,
      headers: proofHeaders(proofToken),
      acceptAuthRotation: true,
      signal,
    })
  )
}

export async function beginPasskeyLogin(): Promise<
  ApiResponse<PasskeyOptionsPayload>
> {
  const res = await api.post<ApiResponse<PasskeyOptionsPayload>>(
    '/api/user/passkey/login/begin'
  )
  return res.data
}

export async function finishPasskeyLogin(
  flowToken: string,
  payload: Record<string, unknown>
): Promise<ApiResponse> {
  const res = await api.post<ApiResponse>(
    '/api/user/passkey/login/finish',
    { flow_token: flowToken, credential: payload },
    { skipAuthRefresh: true }
  )
  return res.data
}

export function beginPasskeyVerification(
  operation: VerificationOperation,
  signal?: AbortSignal
): Promise<PasskeyOptionsPayload> {
  return authResult(
    api.post(
      '/api/user/passkey/verify/begin',
      {
        scope: operation.scope,
        ...(operation.context ? { context: operation.context } : {}),
      },
      { ...authRequestOptions, signal }
    )
  )
}

export function finishPasskeyVerification(
  flowToken: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal
): Promise<SecurityProof> {
  return authResult(
    api.post(
      '/api/user/passkey/verify/finish',
      { flow_token: flowToken, credential: payload },
      { ...authRequestOptions, singleUseAuthorization: true, signal }
    )
  )
}
