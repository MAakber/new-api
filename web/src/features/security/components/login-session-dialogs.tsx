import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import type { LoginSession } from '@/stores/auth-store'

interface LoginSessionDialogsProps {
  revokeTarget: LoginSession | null
  confirmOthers: boolean
  revoking: boolean
  revokingOthers: boolean
  onRevokeTargetChange: (session: LoginSession | null) => void
  onConfirmOthersChange: (open: boolean) => void
  onRevoke: () => void
  onRevokeOthers: () => void
}

export function LoginSessionDialogs({
  revokeTarget,
  confirmOthers,
  revoking,
  revokingOthers,
  onRevokeTargetChange,
  onConfirmOthersChange,
  onRevoke,
  onRevokeOthers,
}: LoginSessionDialogsProps) {
  const { t } = useTranslation()

  return (
    <>
      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && onRevokeTargetChange(null)}
        title={
          revokeTarget?.current
            ? t('Sign out this device?')
            : t('Revoke session?')
        }
        desc={t(
          'This session will lose access immediately and must sign in again.'
        )}
        confirmText={revokeTarget?.current ? t('Sign out') : t('Revoke')}
        destructive
        isLoading={revoking}
        handleConfirm={onRevoke}
      />

      <ConfirmDialog
        open={confirmOthers}
        onOpenChange={onConfirmOthersChange}
        title={t('Sign out other sessions?')}
        desc={t(
          'Every other device will lose access immediately. This device will remain signed in.'
        )}
        confirmText={t('Sign out others')}
        destructive
        isLoading={revokingOthers}
        handleConfirm={onRevokeOthers}
      />
    </>
  )
}
