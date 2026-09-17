import { LaptopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import dayjs from '@/lib/dayjs'
import type { LoginSession } from '@/stores/auth-store'

import { loginMethodLabel, sessionDevice } from './login-session-utils'

interface LoginSessionItemProps {
  session: LoginSession
  onRevoke: (session: LoginSession) => void
}

export function LoginSessionItem({ session, onRevoke }: LoginSessionItemProps) {
  const { t } = useTranslation()
  const maxTouchPoints =
    session.current && typeof navigator !== 'undefined'
      ? navigator.maxTouchPoints
      : 0

  return (
    <div className='flex flex-col gap-3 py-4 sm:flex-row sm:items-center'>
      <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg'>
        <HugeiconsIcon icon={LaptopIcon} className='size-5' strokeWidth={2} />
      </div>
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='font-medium'>
            {sessionDevice(
              session.user_agent,
              t('Unknown device'),
              t('Browser'),
              maxTouchPoints
            )}
          </p>
          {session.current && <Badge variant='secondary'>{t('Current')}</Badge>}
        </div>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('IP: {{ip}} · Method: {{method}}', {
            ip: session.ip || t('Unknown'),
            method: loginMethodLabel(session.login_method, t),
          })}
        </p>
        <p className='text-muted-foreground mt-1 text-xs'>
          {t('Last active {{time}} · Expires {{expires}}', {
            time: dayjs.unix(session.last_active_at).fromNow(),
            expires: dayjs.unix(session.expires_at).format('YYYY-MM-DD HH:mm'),
          })}
        </p>
      </div>
      <Button
        type='button'
        variant={session.current ? 'outline' : 'ghost'}
        size='sm'
        onClick={() => onRevoke(session)}
      >
        {session.current ? t('Sign out') : t('Revoke')}
      </Button>
    </div>
  )
}
