import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { AuthLayout } from '../auth-layout'
import { CompleteRegistrationForm } from './components/complete-registration-form'

export function CompleteRegistration() {
  const { t } = useTranslation()

  return (
    <AuthLayout>
      <div className='w-full space-y-8'>
        <div className='space-y-3'>
          <h2 className='text-center text-2xl font-semibold tracking-tight sm:text-left'>
            {t('Complete registration')}
          </h2>
          <p className='text-muted-foreground text-left text-sm sm:text-base'>
            {t('Enter a registration code to finish creating your account.')}
          </p>
        </div>

        <CompleteRegistrationForm />

        <p className='text-muted-foreground text-center text-sm'>
          {t('Registration session expired?')}{' '}
          <Link
            to='/sign-up'
            className='hover:text-primary font-medium underline underline-offset-4'
          >
            {t('Start again')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}
