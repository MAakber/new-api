import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SecureVerificationDialog } from '@/features/auth/secure-verification'
import { deleteUserAccount } from '@/features/profile/api'
import { clearAuthentication } from '@/lib/api'

import { useAccountSecurity } from '../../hooks/use-account-security'

interface DeleteAccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  username: string
}

export function DeleteAccountDialog(props: DeleteAccountDialogProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirmationId = useId()
  const [confirmation, setConfirmation] = useState('')
  const security = useAccountSecurity()
  const cancel = security.cancel

  useEffect(() => {
    setConfirmation('')
    if (!props.open) cancel()
  }, [props.open, props.username, security.sessionKey, cancel])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      security.cancel()
      setConfirmation('')
    }
    props.onOpenChange(open)
  }

  const handleDelete = async () => {
    if (confirmation !== props.username) return
    const result = await security.run(async (signal) => {
      const proof = await security.verify(
        { scope: 'account.delete', title: t('Delete Account') },
        signal
      )
      return deleteUserAccount(proof, signal)
    })
    if (!result) return
    toast.success(t('Account deleted successfully'))
    props.onOpenChange(false)
    clearAuthentication()
    navigate({ to: '/sign-in' })
  }

  return (
    <>
      <ConfirmDialog
        open={props.open && !security.showVerification}
        onOpenChange={handleOpenChange}
        title={t('Delete Account')}
        desc={t(
          'This action cannot be undone. This will permanently delete your account and remove all your data from our servers.'
        )}
        confirmText={security.pending ? t('Deleting...') : t('Delete Account')}
        destructive
        disabled={confirmation !== props.username || security.pending}
        isLoading={security.pending}
        handleConfirm={handleDelete}
      >
        <Alert variant='destructive'>
          <AlertTriangle className='size-4' />
          <AlertDescription>
            {t('Warning: This action is permanent and irreversible!')}
          </AlertDescription>
        </Alert>
        <div className='space-y-2'>
          <Label htmlFor={confirmationId}>
            {t('Type')} <strong>{props.username}</strong> {t('to confirm')}
          </Label>
          <Input
            id={confirmationId}
            type='text'
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={security.pending}
            placeholder={props.username}
            autoComplete='off'
          />
        </div>
      </ConfirmDialog>
      <SecureVerificationDialog {...security.verificationDialogProps} />
    </>
  )
}
