import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { useAuthStore } from '@/stores/auth-store'

import {
  createAccessToken,
  getAccessTokenStatus,
  revokeAccessToken,
} from '../api'

export function useAccessToken() {
  const { t } = useTranslation()
  const client = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const statusKey = ['security', 'access-token', 'status', userId] as const
  const [generatedToken, setGeneratedToken] = useState<{
    value: string
    userId: number | undefined
    sessionId: string | undefined
  } | null>(null)
  const [pending, setPending] = useState(false)
  const currentOperation = useRef<AbortController | null>(null)
  const verification = useSecureVerification()
  const requestVerification = verification.requestVerification
  const cancelVerification = verification.cancel
  const status = useQuery({
    queryKey: statusKey,
    queryFn: getAccessTokenStatus,
    retry: false,
  })
  useEffect(
    () => () => {
      const current = currentOperation.current
      currentOperation.current = null
      current?.abort()
      cancelVerification()
      setPending(false)
      setGeneratedToken(null)
    },
    [cancelVerification, userId, sessionId]
  )

  const performOperation = useCallback(
    async (operation: 'generate' | 'revoke') => {
      if (currentOperation.current) return
      const controller = new AbortController()
      currentOperation.current = controller
      setPending(true)
      try {
        const proof = await requestVerification({
          scope: `access_token.${operation}`,
        })
        if (currentOperation.current !== controller || !proof) return
        // Proofs and plaintext stay local to this action, outside React Query caches.
        if (operation === 'generate') {
          const generated = await createAccessToken(
            proof.proof_token,
            controller.signal
          )
          if (currentOperation.current !== controller) return
          setGeneratedToken({ value: generated, userId, sessionId })
        } else {
          await revokeAccessToken(proof.proof_token, controller.signal)
          if (currentOperation.current !== controller) return
          setGeneratedToken(null)
          toast.success(t('Access token revoked'))
        }
        void client.invalidateQueries({
          queryKey: ['security', 'access-token', 'status', userId],
        })
      } catch (error) {
        if (currentOperation.current !== controller) return
        const failure = AuthOperationError.from(error)
        if (failure.code !== 'AUTH_CANCELLED') handleServerError(failure)
        void client.invalidateQueries({
          queryKey: ['security', 'access-token', 'status', userId],
        })
      } finally {
        if (currentOperation.current === controller) {
          currentOperation.current = null
          setPending(false)
        }
      }
    },
    [client, requestVerification, t, userId, sessionId]
  )

  return {
    status,
    token:
      generatedToken?.userId === userId &&
      generatedToken?.sessionId === sessionId
        ? (generatedToken?.value ?? '')
        : '',
    pending,
    clearToken: () => {
      setGeneratedToken(null)
    },
    generate: () => performOperation('generate'),
    revoke: () => performOperation('revoke'),
    verificationDialogProps: verification.dialogProps,
  }
}
