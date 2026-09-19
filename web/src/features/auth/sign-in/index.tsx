import { Link, useSearch } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { LanguageSwitcher } from '@/components/language-switcher'
import { useStatus } from '@/hooks/use-status'

import { AuthLayout } from '../auth-layout'
import { TermsFooter } from '../components/terms-footer'
import { UserAuthForm } from './components/user-auth-form'

const DOCS_URL = 'https://docs.newapi.ai'

export function SignIn() {
  const { t } = useTranslation()
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const { status } = useStatus()

  return (
    <AuthLayout
      variant='sign-in'
      footer={
        <>
          <a
            href={DOCS_URL}
            target='_blank'
            rel='noopener noreferrer'
            className='hover:text-primary font-medium transition-colors'
          >
            {t('Docs')}
          </a>
          <LanguageSwitcher />
          <TermsFooter
            variant='sign-in'
            status={status}
            className='w-full text-start sm:ms-auto sm:w-auto sm:text-end'
          />
        </>
      }
    >
      <div className='w-full space-y-6 sm:space-y-8'>
        <div className='space-y-2'>
          <h2 className='text-center text-2xl font-semibold tracking-tight lg:text-left'>
            {t('Sign in')}
          </h2>
          {!status?.self_use_mode_enabled &&
            status?.register_enabled !== false && (
              <p className='text-muted-foreground text-center text-sm sm:text-base lg:text-left'>
                {t("Don't have an account?")}{' '}
                <Link
                  to='/sign-up'
                  className='auth-ink-action-link hover:text-primary font-medium underline underline-offset-4'
                >
                  {t('Sign up')}
                </Link>
                .
              </p>
            )}
        </div>

        <UserAuthForm redirectTo={redirect} />
      </div>
    </AuthLayout>
  )
}
