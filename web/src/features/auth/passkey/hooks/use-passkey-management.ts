import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildRegistrationResult,
  createCredential,
  isPasskeySupported,
  prepareCredentialCreationOptions,
} from '@/lib/passkey'
import { AuthOperationError } from '@/lib/secure-verification'

import {
  beginPasskeyRegistration,
  deletePasskeyById,
  finishPasskeyRegistration,
  getPasskeys,
  getPasskeyStatus,
} from '../api'
import type { PasskeyCredentialSummary, PasskeyStatus } from '../types'

export function usePasskeyManagement() {
  const [status, setStatus] = useState<PasskeyStatus | null>(null)
  const [credentials, setCredentials] = useState<PasskeyCredentialSummary[]>([])
  const [statusError, setStatusError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [registering, setRegistering] = useState(false)
  const [removingId, setRemovingId] = useState<number | null>(null)
  const [supported, setSupported] = useState(false)
  const operation = useRef<AbortController | null>(null)
  const mounted = useRef(true)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const [response, listResponse] = await Promise.all([
        getPasskeyStatus(),
        getPasskeys(),
      ])
      if (
        !response.success ||
        !response.data ||
        !listResponse.success ||
        !listResponse.data
      ) {
        throw new AuthOperationError(
          response.message ||
            listResponse.message ||
            'Failed to load Passkey status'
        )
      }
      if (!mounted.current) return
      setCredentials(listResponse.data.credentials)
      setStatus(response.data)
      setStatusError(null)
    } catch (error) {
      if (mounted.current) {
        setStatusError(AuthOperationError.from(error).message)
      }
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    void fetchStatus()
    void isPasskeySupported().then((value) => {
      if (mounted.current) setSupported(value)
    })
    return () => {
      mounted.current = false
      operation.current?.abort()
    }
  }, [fetchStatus])

  const register = useCallback(
    async (displayName: string, proofToken: string) => {
      if (!supported || !navigator.credentials) {
        throw new AuthOperationError('This device does not support Passkey')
      }
      if (operation.current) {
        throw new AuthOperationError(
          'A security operation is already in progress.'
        )
      }
      const controller = new AbortController()
      operation.current = controller
      setRegistering(true)
      try {
        const begin = await beginPasskeyRegistration(
          displayName,
          proofToken,
          controller.signal
        )
        if (!begin.flow_token) {
          throw new AuthOperationError(
            'Registration flow expired. Please try again.'
          )
        }
        const credential = (await createCredential(
          prepareCredentialCreationOptions(begin.options ?? begin),
          controller.signal
        )) as PublicKeyCredential | null
        controller.signal.throwIfAborted()
        if (!credential) {
          throw new AuthOperationError(
            'Passkey registration was cancelled',
            'AUTH_CANCELLED'
          )
        }
        const attestation = buildRegistrationResult(credential)
        if (!attestation) {
          throw new AuthOperationError('Invalid Passkey registration response')
        }
        await finishPasskeyRegistration(
          begin.flow_token,
          attestation,
          controller.signal
        )
        controller.signal.throwIfAborted()
        await fetchStatus()
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) await fetchStatus()
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === 'NotAllowedError')
        ) {
          throw new AuthOperationError(
            'Passkey registration was cancelled',
            'AUTH_CANCELLED',
            { cause: error }
          )
        }
        throw AuthOperationError.from(error, 'Failed to register Passkey')
      } finally {
        if (operation.current === controller) operation.current = null
        if (mounted.current) setRegistering(false)
      }
    },
    [fetchStatus, supported]
  )

  const remove = useCallback(
    async (id: number, proofToken: string) => {
      if (operation.current) {
        throw new AuthOperationError(
          'A security operation is already in progress.'
        )
      }
      const controller = new AbortController()
      operation.current = controller
      setRemovingId(id)
      try {
        await deletePasskeyById(id, proofToken, controller.signal)
        controller.signal.throwIfAborted()
        await fetchStatus()
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) await fetchStatus()
        if (controller.signal.aborted) {
          throw new AuthOperationError(
            'Operation cancelled',
            'AUTH_CANCELLED',
            { cause: error }
          )
        }
        throw AuthOperationError.from(error, 'Failed to remove Passkey')
      } finally {
        if (operation.current === controller) operation.current = null
        if (mounted.current) setRemovingId(null)
      }
    },
    [fetchStatus]
  )

  return {
    status,
    credentials,
    statusError,
    loading,
    registering,
    removingId,
    supported,
    enabled: Boolean(status?.enabled),
    lastUsed: status?.last_used_at ?? null,
    fetchStatus,
    register,
    remove,
  }
}
