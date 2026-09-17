import { Shield, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'

import { ChangePasswordDialog } from './dialogs/change-password-dialog'
import { DeleteAccountDialog } from './dialogs/delete-account-dialog'

type AccountActionCardProps = {
  action: 'password' | 'delete'
  username: string
  hasPassword?: boolean
  onUpdate?: () => void
}

export function AccountActionCard(props: AccountActionCardProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const actions = {
    password: {
      title: t(
        props.hasPassword === false ? 'Set Password' : 'Change Password'
      ),
      description: t(
        props.hasPassword === false
          ? 'Add a password after verifying your identity'
          : 'Update your password to keep your account secure'
      ),
      icon: Shield,
    },
    delete: {
      title: t('Delete Account'),
      description: t('Permanently delete your account and all data'),
      icon: Trash2,
    },
  }
  const action = actions[props.action]
  return (
    <>
      <Card
        data-card-hover='false'
        className={`gap-0 py-0 ${props.action === 'delete' ? 'ring-destructive/30' : ''}`}
      >
        <div className='flex items-center gap-3 px-3 py-2.5 sm:px-4'>
          <IconBadge tone='neutral' size='sm'>
            <action.icon />
          </IconBadge>
          <div className='min-w-0 flex-1 space-y-0.5'>
            <p className='text-sm font-medium'>{action.title}</p>
            <p className='text-muted-foreground text-xs'>
              {action.description}
            </p>
          </div>
          <Button
            type='button'
            size='sm'
            variant={props.action === 'delete' ? 'destructive' : 'outline'}
            onClick={() => setOpen(true)}
          >
            {action.title}
          </Button>
        </div>
      </Card>
      {props.action === 'password' && (
        <ChangePasswordDialog
          open={open}
          onOpenChange={setOpen}
          username={props.username}
          hasPassword={props.hasPassword}
          onSuccess={props.onUpdate}
        />
      )}
      {props.action === 'delete' && (
        <DeleteAccountDialog
          open={open}
          onOpenChange={setOpen}
          username={props.username}
        />
      )}
    </>
  )
}
