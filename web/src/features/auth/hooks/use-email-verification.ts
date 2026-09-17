import i18next from 'i18next'
import { useState } from 'react'
import { toast } from 'sonner'

import { useCountdown } from '@/hooks/use-countdown'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'

import { sendEmailVerification } from '../api'
import { EMAIL_VERIFICATION_COUNTDOWN } from '../constants'

interface UseEmailVerificationOptions {
  turnstileToken?: string
  validateTurnstile?: () => boolean
}

/**
 * Hook for managing email verification code sending
 */
export function useEmailVerification(options?: UseEmailVerificationOptions) {
  const [isSending, setIsSending] = useState(false)
  const {
    secondsLeft,
    isActive,
    start: startCountdown,
  } = useCountdown({ initialSeconds: EMAIL_VERIFICATION_COUNTDOWN })

  /**
   * Send verification code to email
   */
  const sendCode = async (email: string) => {
    if (!email) {
      toast.error(i18next.t('Please enter your email first'))
      return false
    }

    // Validate turnstile if validation function is provided
    if (options?.validateTurnstile && !options.validateTurnstile()) {
      return false
    }

    setIsSending(true)
    try {
      const res = await sendEmailVerification(email, options?.turnstileToken)
      if (res?.success) {
        startCountdown()
        toast.success(i18next.t('Verification email sent'))
        return true
      }
      handleServerError(
        createServerError(res, i18next.t('Failed to send verification email'))
      )
      return false
    } catch (_error) {
      handleServerError(
        AuthOperationError.from(
          _error,
          i18next.t('Failed to send verification email')
        )
      )
      return false
    } finally {
      setIsSending(false)
    }
  }

  return {
    isSending,
    secondsLeft,
    isActive,
    sendCode,
  }
}
