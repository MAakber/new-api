/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import i18next from 'i18next'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  buildRegistrationResult,
  createCredential,
  isPasskeySupported as detectPasskeySupport,
  prepareCredentialCreationOptions,
} from '@/lib/passkey'

import {
  beginPasskeyRegistration,
  deletePasskeyById,
  finishPasskeyRegistration,
  getPasskeys,
  getPasskeyStatus,
} from '../api'
import type { PasskeyCredentialSummary, PasskeyStatus } from '../types'

interface UsePasskeyManagementOptions {
  onStatusChange?: (status: PasskeyStatus | null) => void
}

export function usePasskeyManagement(
  options: UsePasskeyManagementOptions = {}
) {
  const { onStatusChange } = options

  const [status, setStatus] = useState<PasskeyStatus | null>(null)
  const [credentials, setCredentials] = useState<PasskeyCredentialSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [supported, setSupported] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true)
      const [statusResponse, listResponse] = await Promise.all([
        getPasskeyStatus(),
        getPasskeys(),
      ])
      if (statusResponse.success && listResponse.success) {
        setStatus(statusResponse.data ?? null)
        setCredentials(listResponse.data?.credentials ?? [])
        onStatusChange?.(statusResponse.data ?? null)
      } else {
        setStatus(null)
        setCredentials([])
        toast.error(
          statusResponse.message ||
            listResponse.message ||
            i18next.t('Failed to load Passkey status')
        )
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[Passkey] Failed to fetch status', error)
      toast.error(i18next.t('Failed to load Passkey status'))
      setStatus(null)
      setCredentials([])
    } finally {
      setLoading(false)
    }
  }, [onStatusChange])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    detectPasskeySupport()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  const register = useCallback(
    async (displayName: string, proofToken?: string) => {
      if (!supported) {
        toast.error(i18next.t('This device does not support Passkey'))
        return false
      }
      if (!navigator?.credentials) {
        toast.error(i18next.t('Passkey is not supported in this environment'))
        return false
      }

      setRegistering(true)
      try {
        const beginResponse = await beginPasskeyRegistration(
          displayName,
          proofToken
        )
        if (!beginResponse.success) {
          toast.error(
            beginResponse.message ||
              i18next.t('Failed to start Passkey registration')
          )
          return false
        }

        const publicKey = prepareCredentialCreationOptions(
          beginResponse.data?.options ?? beginResponse.data
        )
        const flowToken = beginResponse.data?.flow_token
        if (!flowToken) {
          toast.error(i18next.t('Registration flow expired. Please try again.'))
          return false
        }

        const credential = (await createCredential(
          publicKey
        )) as PublicKeyCredential | null
        if (!credential) {
          toast.error(i18next.t('Passkey registration was cancelled'))
          return false
        }

        const attestation = buildRegistrationResult(credential)
        if (!attestation) {
          toast.error(i18next.t('Invalid Passkey registration response'))
          return false
        }

        const finishResponse = await finishPasskeyRegistration(
          flowToken,
          attestation,
          proofToken
        )
        if (!finishResponse.success) {
          toast.error(
            finishResponse.message || i18next.t('Failed to register Passkey')
          )
          return false
        }

        toast.success(i18next.t('Passkey registered successfully'))
        await fetchStatus()
        return true
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          toast.info(i18next.t('Passkey registration was cancelled'))
          return false
        }
        // eslint-disable-next-line no-console
        console.error('[Passkey] Registration error', error)
        toast.error(
          error instanceof Error
            ? error.message
            : i18next.t('Failed to register Passkey')
        )
        return false
      } finally {
        setRegistering(false)
      }
    },
    [supported, fetchStatus]
  )

  const remove = useCallback(
    async (id: number, proofToken?: string) => {
      setRemovingId(id)
      try {
        const res = await deletePasskeyById(id, proofToken)
        if (!res.success) {
          toast.error(res.message || i18next.t('Failed to remove Passkey'))
          return false
        }

        toast.success(i18next.t('Passkey removed successfully'))
        await fetchStatus()
        return true
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[Passkey] Removal error', error)
        toast.error(i18next.t('Failed to remove Passkey'))
        return false
      } finally {
        setRemovingId(null)
      }
    },
    [fetchStatus]
  )

  const enabled = useMemo(() => Boolean(status?.enabled), [status])
  const lastUsed = useMemo(() => status?.last_used_at ?? null, [status])

  return {
    status,
    credentials,
    loading,
    registering,
    removingId,
    supported,
    enabled,
    lastUsed,
    fetchStatus,
    register,
    remove,
  }
}
