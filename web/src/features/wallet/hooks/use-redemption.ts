import i18next from 'i18next'
import { useState, useCallback } from 'react'
import { toast } from 'sonner'

import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { redeemTopupCode } from '../api'

// ============================================================================
// Redemption Hook
// ============================================================================

export function useRedemption() {
  const [redeeming, setRedeeming] = useState(false)

  const redeemCode = useCallback(
    async (code: string): Promise<'quota' | 'subscription' | null> => {
      if (!code || code.trim() === '') {
        toast.error(i18next.t('Please enter a redemption code'))
        return null
      }

      try {
        setRedeeming(true)
        const response = await redeemTopupCode({ key: code })

        if (response.success && response.data !== undefined) {
          if (typeof response.data === 'number') {
            toast.success(
              i18next.t('Redemption successful! Added: {{quota}}', {
                quota: formatQuota(response.data),
              })
            )
            await getSelf()
            return 'quota'
          }
          toast.success(
            i18next.t('Subscription activated: {{plan}}', {
              plan:
                response.data.plan_title ||
                i18next.t('Subscription plan #{{id}}', {
                  id: response.data.plan_id,
                }),
            })
          )
          await getSelf()
          return 'subscription'
        }

        handleServerError(response, i18next.t('Redemption failed'))
        return null
      } catch (error) {
        handleServerError(error, i18next.t('Redemption failed'))
        return null
      } finally {
        setRedeeming(false)
      }
    },
    []
  )

  return {
    redeeming,
    redeemCode,
  }
}
