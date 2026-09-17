import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import i18next from 'i18next'
import { useEffect } from 'react'

import { wechatLoginByCode } from '@/features/auth/api'
import { isPendingRegistrationChallenge } from '@/features/auth/complete-registration/flow-response'
import { sanitizeAuthRedirect } from '@/features/auth/lib/auth-redirect'
import { applyAuthBundle, isAuthBundle } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { AuthOperationError } from '@/lib/secure-verification'
import { createServerError } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

function OAuthComponent() {
  const navigate = useNavigate()
  const setPendingRegistrationFlowToken = useAuthStore(
    (state) => state.auth.setPendingRegistrationFlowToken
  )
  const search = useSearch({ from: '/(auth)/oauth' }) as {
    redirect?: string
    provider?: 'github' | 'discord' | 'oidc' | 'linuxdo' | 'telegram' | 'wechat'
    code?: string
    state?: string
  }

  useEffect(() => {
    ;(async () => {
      try {
        if (search?.provider === 'wechat' && search.code) {
          const res = await wechatLoginByCode(search.code)
          if (res?.success && isPendingRegistrationChallenge(res.data)) {
            setPendingRegistrationFlowToken(res.data.flow_token)
            navigate({ to: '/complete-registration', replace: true })
            return
          }
          if (res?.success && isAuthBundle(res.data)) {
            applyAuthBundle(res.data)
            const target =
              sanitizeAuthRedirect(search?.redirect, window.location.origin) ??
              '/dashboard'
            navigate({ href: target, replace: true })
            return
          }
          throw createServerError(res, i18next.t('OAuth failed'))
        }
        handleServerError(new AuthOperationError(i18next.t('OAuth failed')))
      } catch (error: unknown) {
        handleServerError(
          AuthOperationError.from(error, i18next.t('OAuth failed'))
        )
      }
      navigate({ to: '/sign-in', replace: true })
    })()
  }, [navigate, search, setPendingRegistrationFlowToken])

  return null
}

export const Route = createFileRoute('/(auth)/oauth')({
  component: OAuthComponent,
})
