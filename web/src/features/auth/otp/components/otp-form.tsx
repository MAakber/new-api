import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { useAuthStore } from '@/stores/auth-store'

import { useAuthRedirect } from '../../hooks/use-auth-redirect'
import {
  SecureVerificationDialog,
  useSecureVerification,
} from '../../secure-verification'

export function OtpForm() {
  const { t } = useTranslation()
  // Transfer the pending challenge from the navigation handoff into this page's
  // lifetime. Reloading or leaving the page cannot resume it from browser storage.
  const pending = useRef(
    useAuthStore.getState().auth.pendingLoginVerification
  ).current
  const initialSessionID = useRef(
    useAuthStore.getState().auth.session?.sid
  ).current
  const sessionID = useAuthStore((state) => state.auth.session?.sid)
  const verification = useSecureVerification()
  const { requestLoginVerification, cancel } = verification
  const { handleLoginSuccess, redirectToLogin } = useAuthRedirect()
  const completed = useRef(false)

  useEffect(() => {
    if (completed.current) return
    if (!pending) {
      redirectToLogin()
      return
    }
    if (sessionID !== initialSessionID) {
      cancel()
      return
    }
    if (useAuthStore.getState().auth.pendingLoginVerification === pending) {
      useAuthStore.getState().auth.setPendingLoginVerification(null)
    }
    let active = true
    void (async () => {
      try {
        const bundle = await requestLoginVerification(pending.challenge)
        if (
          !active ||
          useAuthStore.getState().auth.session?.sid !== initialSessionID
        ) {
          return
        }
        if (!bundle) {
          redirectToLogin()
          return
        }
        completed.current = true
        await handleLoginSuccess(bundle, pending.redirectTo)
        toast.success(t('Signed in'))
      } catch (error) {
        if (!active) return
        handleServerError(AuthOperationError.from(error))
        redirectToLogin()
      }
    })()
    return () => {
      active = false
      cancel()
    }
  }, [
    pending,
    initialSessionID,
    sessionID,
    requestLoginVerification,
    cancel,
    handleLoginSuccess,
    redirectToLogin,
    t,
  ])

  return <SecureVerificationDialog {...verification.dialogProps} />
}
