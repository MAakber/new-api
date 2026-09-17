import { useState, type CSSProperties } from 'react'

import type { TopNavLink } from '../types'
import { PublicAnnouncementBanner } from './public-announcement-banner'
import { PublicHeader, type PublicHeaderProps } from './public-header'

type PublicLayoutProps = {
  children: React.ReactNode
  showMainContainer?: boolean
  navContent?: React.ReactNode
  headerProps?: Omit<PublicHeaderProps, 'navContent'>
  navLinks?: TopNavLink[]
  showThemeSwitch?: boolean
  showAuthButtons?: boolean
  showNotifications?: boolean
  logo?: React.ReactNode
  siteName?: string
}

export function PublicLayout(props: PublicLayoutProps) {
  const [announcementVisible, setAnnouncementVisible] = useState(false)
  const layoutStyle = {
    '--public-announcement-height': '3.5rem',
    '--public-announcement-offset': announcementVisible
      ? 'var(--public-announcement-height)'
      : '0px',
  } as CSSProperties

  return (
    <div
      className='bg-background text-foreground relative min-h-svh overflow-x-clip'
      style={layoutStyle}
    >
      <PublicAnnouncementBanner onVisibilityChange={setAnnouncementVisible} />
      <PublicHeader
        navContent={props.navContent}
        navLinks={props.navLinks}
        showThemeSwitch={props.showThemeSwitch}
        showAuthButtons={props.showAuthButtons}
        showNotifications={props.showNotifications}
        logo={props.logo}
        siteName={props.siteName}
        {...props.headerProps}
      />

      {props.showMainContainer !== false ? (
        <main className='container px-4 py-6 pt-[calc(5rem+var(--public-announcement-offset))] md:px-4'>
          {props.children}
        </main>
      ) : (
        <div className='pt-[var(--public-announcement-offset)]'>
          {props.children}
        </div>
      )}
    </div>
  )
}
