import { AlertTriangle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { disable2FA } from '@/lib/api'

import { useAccountSecurity } from '../../hooks/use-account-security'

interface TwoFADisableDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function TwoFADisableDialog(props: TwoFADisableDialogProps) {
  const { t } = useTranslation()
  const confirmId = useId()
  const [confirmed, setConfirmed] = useState(false)
  const security = useAccountSecurity()
  const cancel = security.cancel

  useEffect(() => {
    setConfirmed(false)
    if (!props.open) cancel()
  }, [props.open, security.sessionKey, cancel])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      security.cancel()
      setConfirmed(false)
    }
    props.onOpenChange(open)
  }
  const handleDisable = async () => {
    if (!confirmed) return
    const result = await security.run(async (signal) => {
      const proof = await security.verify({ scope: '2fa.disable' }, signal)
      return disable2FA(proof, signal)
    })
    if (!result) return
    toast.success(t('Two-factor authentication disabled'))
    props.onOpenChange(false)
    props.onSuccess()
  }

  return (
    <>
      <ConfirmDialog
        open={props.open && !security.showVerification}
        onOpenChange={handleOpenChange}
        title={t('Disable Two-Factor Authentication')}
        desc={t(
          'This action will permanently remove 2FA protection from your account.'
        )}
        confirmText={t('Disable 2FA')}
        destructive
        disabled={!confirmed || security.pending}
        isLoading={security.pending}
        handleConfirm={handleDisable}
      >
        <Alert variant='destructive'>
          <AlertTriangle className='size-4' />
          <AlertDescription>
            {t('Warning: Disabling 2FA will make your account less secure.')}
          </AlertDescription>
        </Alert>
        <div className='flex items-start gap-2'>
          <Checkbox
            id={confirmId}
            checked={confirmed}
            disabled={security.pending}
            onCheckedChange={(checked) => setConfirmed(checked === true)}
          />
          <Label
            htmlFor={confirmId}
            className='text-sm leading-tight font-normal'
          >
            {t(
              'I understand that disabling 2FA removes its authenticator and backup codes.'
            )}
          </Label>
        </div>
      </ConfirmDialog>
      <SecureVerificationDialog {...security.verificationDialogProps} />
    </>
  )
}
