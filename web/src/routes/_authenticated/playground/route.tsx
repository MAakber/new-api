import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Button } from '@/components/ui/button'
import { isSidebarModuleEnabled } from '@/lib/nav-modules'

export const Route = createFileRoute('/_authenticated/playground')({
  beforeLoad: () => {
    if (!isSidebarModuleEnabled('chat', 'playground')) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: PlaygroundLayout,
})

function PlaygroundLayout() {
  const { t } = useTranslation()
  return (
    <Main className='p-0'>
      <div className='flex h-12 shrink-0 items-center gap-5 border-b px-4'>
        <h1 className='text-sm font-semibold'>{t('Playground')}</h1>
        <nav aria-label={t('Playground')} className='flex items-center gap-1'>
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={
              <Link
                to='/playground/chat'
                activeProps={{
                  className: 'bg-muted text-foreground',
                  'aria-current': 'page',
                }}
              />
            }
          >
            {t('Chat')}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            nativeButton={false}
            render={
              <Link
                to='/playground/drawing'
                activeProps={{
                  className: 'bg-muted text-foreground',
                  'aria-current': 'page',
                }}
              />
            }
          >
            {t('Drawing')}
          </Button>
        </nav>
      </div>
      <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
        <Outlet />
      </div>
    </Main>
  )
}
