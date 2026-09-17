import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useSecureVerification } from '@/features/auth/secure-verification'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import { getChannelKey } from '../api'

export function useChannelKeyDisclosure(
  open: boolean,
  channelId: number | null
) {
  const { t } = useTranslation()
  const verification = useSecureVerification()
  const cancelVerification = verification.cancel
  const requestVerification = verification.requestVerification
  const [disclosedKey, setDisclosedKey] = useState<{
    channelId: number
    key: string
    keys: string[]
  } | null>(null)
  const [isChannelKeyLoading, setIsChannelKeyLoading] = useState(false)
  const operation = useRef<AbortController | null>(null)

  useEffect(() => {
    setDisclosedKey(null)
    setIsChannelKeyLoading(false)
    return () => {
      operation.current?.abort()
      operation.current = null
      cancelVerification()
    }
  }, [open, channelId, cancelVerification])

  const handleRevealKey = useCallback(async () => {
    if (!channelId || !open || operation.current) return
    const current = new AbortController()
    operation.current = current
    try {
      const proof = await requestVerification({
        scope: 'channel.key.read',
        context: { channel_id: channelId },
        title: t('Verify to view channel key'),
        description: t(
          'Use Passkey or 2FA to confirm your identity before revealing this channel key.'
        ),
      })
      if (!proof || operation.current !== current) return
      setIsChannelKeyLoading(true)
      const res = await getChannelKey(
        channelId,
        proof.proof_token,
        current.signal
      )
      if (operation.current !== current) return
      if (!res.success) {
        throw createServerError(res, t('Failed to fetch channel key'))
      }
      const key = res.data?.key ?? ''
      setDisclosedKey({ channelId, key, keys: res.data?.keys ?? [key] })
      toast.success(t('Channel key unlocked'))
    } catch (error) {
      if (operation.current === current && !current.signal.aborted) {
        handleServerError(AuthOperationError.from(error))
      }
    } finally {
      if (operation.current === current) {
        operation.current = null
        setIsChannelKeyLoading(false)
      }
    }
  }, [channelId, open, requestVerification, t])

  const channelKey =
    open && disclosedKey?.channelId === channelId ? disclosedKey.key : null
  const channelKeys =
    open && disclosedKey?.channelId === channelId ? disclosedKey.keys : null
  const hideKey = useCallback(() => setDisclosedKey(null), [])
  return {
    channelKey,
    channelKeys,
    hideKey,
    isChannelKeyLoading,
    handleRevealKey,
    verification,
  }
}
