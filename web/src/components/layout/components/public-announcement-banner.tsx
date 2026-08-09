/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useBanners } from '@/features/banners'
import {
  getBannerSetVersion,
  getSafeBannerLink,
  isBannerCurrentlyVisible,
} from '@/features/banners/lib/banner-utils'
import { getPreviewText } from '@/features/dashboard/lib'
import { getAnnouncementColorClass } from '@/lib/colors'
import { cn } from '@/lib/utils'

const DISMISSED_VERSION_STORAGE_KEY = 'public-banner-dismissed-version'
const ROTATION_INTERVAL_MS = 8000

const PUBLIC_ANNOUNCEMENT_THEME = {
  default: {
    banner: 'text-neutral-foreground border-neutral-foreground/35',
    controls:
      'text-neutral-foreground hover:bg-neutral-foreground/10 hover:text-neutral-foreground focus-visible:border-neutral-foreground/70 focus-visible:ring-neutral-foreground/70',
    link: 'text-neutral-foreground decoration-neutral-foreground/40 hover:bg-neutral-foreground/10 hover:decoration-neutral-foreground focus-visible:ring-neutral-foreground/70',
  },
  ongoing: {
    banner: 'text-info-foreground border-info-foreground/35',
    controls:
      'text-info-foreground hover:bg-info-foreground/10 hover:text-info-foreground focus-visible:border-info-foreground/70 focus-visible:ring-info-foreground/70',
    link: 'text-info-foreground decoration-info-foreground/40 hover:bg-info-foreground/10 hover:decoration-info-foreground focus-visible:ring-info-foreground/70',
  },
  success: {
    banner: 'text-success-foreground border-success-foreground/35',
    controls:
      'text-success-foreground hover:bg-success-foreground/10 hover:text-success-foreground focus-visible:border-success-foreground/70 focus-visible:ring-success-foreground/70',
    link: 'text-success-foreground decoration-success-foreground/40 hover:bg-success-foreground/10 hover:decoration-success-foreground focus-visible:ring-success-foreground/70',
  },
  warning: {
    banner: 'text-warning-foreground border-warning-foreground/35',
    controls:
      'text-warning-foreground hover:bg-warning-foreground/10 hover:text-warning-foreground focus-visible:border-warning-foreground/70 focus-visible:ring-warning-foreground/70',
    link: 'text-warning-foreground decoration-warning-foreground/40 hover:bg-warning-foreground/10 hover:decoration-warning-foreground focus-visible:ring-warning-foreground/70',
  },
  error: {
    banner: 'text-destructive-foreground border-destructive-foreground/35',
    controls:
      'text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground focus-visible:border-destructive-foreground/70 focus-visible:ring-destructive-foreground/70',
    link: 'text-destructive-foreground decoration-destructive-foreground/40 hover:bg-destructive-foreground/10 hover:decoration-destructive-foreground focus-visible:ring-destructive-foreground/70',
  },
} as const

type PublicAnnouncementBannerProps = {
  onVisibilityChange?: (visible: boolean) => void
}

function readDismissedVersion(): string | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage.getItem(DISMISSED_VERSION_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeDismissedVersion(version: string): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(DISMISSED_VERSION_STORAGE_KEY, version)
  } catch {
    /* Ignore storage failures; the banner can still be dismissed in memory. */
  }
}

export function PublicAnnouncementBanner(props: PublicAnnouncementBannerProps) {
  const { t } = useTranslation()
  const { data: items = [] } = useBanners()
  const onVisibilityChange = props.onVisibilityChange
  const shouldReduceMotion = useReducedMotion() ?? false
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState(() =>
    readDismissedVersion()
  )

  const banners = useMemo(() => items.filter(isBannerCurrentlyVisible), [items])
  const bannerVersion = useMemo(() => getBannerSetVersion(banners), [banners])
  const isVisible = banners.length > 0 && dismissedVersion !== bannerVersion
  const currentIndex = Math.min(activeIndex, Math.max(banners.length - 1, 0))
  const currentBanner = banners[currentIndex]
  const currentLink = getSafeBannerLink(currentBanner?.link)

  useEffect(() => {
    if (!bannerVersion) return
    setActiveIndex(0)
  }, [bannerVersion])

  useEffect(() => {
    if (activeIndex < banners.length) return
    setActiveIndex(0)
  }, [activeIndex, banners.length])

  useEffect(() => {
    onVisibilityChange?.(isVisible)
  }, [isVisible, onVisibilityChange])

  useEffect(() => {
    if (!isVisible || banners.length < 2 || shouldReduceMotion || isPaused) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % banners.length)
    }, ROTATION_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [banners.length, isPaused, isVisible, shouldReduceMotion])

  const goToPrevious = useCallback(() => {
    setActiveIndex((index) =>
      banners.length > 0 ? (index - 1 + banners.length) % banners.length : 0
    )
  }, [banners.length])

  const goToNext = useCallback(() => {
    setActiveIndex((index) =>
      banners.length > 0 ? (index + 1) % banners.length : 0
    )
  }, [banners.length])

  const handleDismiss = () => {
    setDismissedVersion(bannerVersion)
    setIsPaused(true)
    writeDismissedVersion(bannerVersion)
  }

  if (!isVisible || !currentBanner) return null

  const bannerText =
    getPreviewText(currentBanner.content, 180) || t('Banner content')
  const bannerKey = `${currentBanner.id}-${bannerVersion}-${currentIndex}`
  const bannerTheme =
    PUBLIC_ANNOUNCEMENT_THEME[currentBanner.type] ??
    PUBLIC_ANNOUNCEMENT_THEME.default

  return (
    <section
      aria-label={t('Banners')}
      className={cn(
        'fixed inset-x-0 top-0 z-[60] h-[var(--public-announcement-height)] overflow-hidden border-b shadow-[0_8px_24px_-16px_rgba(0,0,0,0.7)]',
        getAnnouncementColorClass(currentBanner.type),
        bannerTheme.banner
      )}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget as Node | null
        if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
          setIsPaused(false)
        }
      }}
      onFocusCapture={() => setIsPaused(true)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        aria-hidden='true'
        className='public-announcement-stripes pointer-events-none absolute inset-0 opacity-80'
      />

      <div className='relative mx-auto grid h-full max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 px-1.5 sm:gap-3 sm:px-4'>
        <div className='flex items-center gap-1'>
          {banners.length > 1 && (
            <Button
              aria-label={t('Previous banner')}
              className={bannerTheme.controls}
              onClick={goToPrevious}
              size='icon-xs'
              type='button'
              variant='ghost'
            >
              <ChevronLeft aria-hidden='true' />
            </Button>
          )}
        </div>

        <div
          aria-atomic='true'
          aria-live='polite'
          className='min-w-0 text-center'
        >
          <div
            key={bannerKey}
            className='public-announcement-copy flex min-w-0 items-center justify-center gap-2'
          >
            <p className='line-clamp-2 min-w-0 text-center text-[11px] leading-4 font-medium sm:line-clamp-1 sm:text-xs'>
              {bannerText}
            </p>
            {currentLink && (
              <a
                className={cn(
                  'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold whitespace-nowrap underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:text-xs',
                  bannerTheme.link
                )}
                href={currentLink}
                rel='noopener noreferrer'
                target='_blank'
              >
                {t('Learn more')}
                <ExternalLink aria-hidden='true' className='size-3' />
              </a>
            )}
          </div>
          {banners.length > 1 && (
            <span className='sr-only'>
              {t('Banner {{current}} of {{total}}', {
                current: currentIndex + 1,
                total: banners.length,
              })}
            </span>
          )}
        </div>

        <div className='flex items-center gap-1'>
          {banners.length > 1 && (
            <Button
              aria-label={t('Next banner')}
              className={bannerTheme.controls}
              onClick={goToNext}
              size='icon-xs'
              type='button'
              variant='ghost'
            >
              <ChevronRight aria-hidden='true' />
            </Button>
          )}
          <Button
            aria-label={t('Dismiss banner')}
            className={bannerTheme.controls}
            onClick={handleDismiss}
            size='icon-xs'
            type='button'
            variant='ghost'
          >
            <X aria-hidden='true' />
          </Button>
        </div>
      </div>
    </section>
  )
}
