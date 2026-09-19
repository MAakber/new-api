import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import { useSystemConfig } from '@/hooks/use-system-config'
import { cn } from '@/lib/utils'

import { InkRouteMap } from './components/ink-route-map'

type AuthLayoutProps = {
  children: React.ReactNode
  variant?: 'default' | 'sign-in'
  footer?: React.ReactNode
}

export function AuthLayout({
  children,
  variant = 'default',
  footer,
}: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()
  const isSignIn = variant === 'sign-in'

  const brand = (
    <>
      <div className='relative h-8 w-8 shrink-0'>
        {loading ? (
          <Skeleton className='absolute inset-0 rounded-full' />
        ) : (
          <img
            src={logo}
            alt={t('Logo')}
            className='h-8 w-8 rounded-full object-cover'
          />
        )}
      </div>
      {loading ? (
        <Skeleton className='h-6 w-24' />
      ) : (
        <h1
          className={cn('text-xl font-medium', isSignIn && 'min-w-0 truncate')}
        >
          {systemName}
        </h1>
      )}
    </>
  )

  if (!isSignIn) {
    return (
      <div className='relative grid h-svh max-w-none'>
        <Link
          to='/'
          className='absolute top-4 left-4 z-10 flex items-center gap-2 transition-opacity hover:opacity-80 sm:top-8 sm:left-8'
        >
          {brand}
        </Link>
        <div className='container flex items-center pt-16 sm:pt-0'>
          <div className='mx-auto flex w-full flex-col justify-center space-y-2 px-4 py-8 sm:w-[480px] sm:p-8'>
            {children}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className='auth-ink-shell'>
      <div className='auth-ink-form-pane'>
        <Link
          to='/'
          className='auth-ink-brand min-w-0 transition-opacity hover:opacity-80'
        >
          {brand}
        </Link>
        <div className='auth-ink-form-body'>
          <div className='auth-ink-form'>{children}</div>
        </div>
        {footer ? <div className='auth-ink-pane-footer'>{footer}</div> : null}
      </div>
      <div className='auth-ink-stage-pane' aria-hidden='true'>
        <InkRouteMap />
      </div>
    </div>
  )
}
