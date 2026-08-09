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
import { useAnnouncements } from '@/features/dashboard/hooks/use-status-data'
import { getPreviewText } from '@/features/dashboard/lib'
import type { AnnouncementItem } from '@/features/dashboard/types'
import {
  getAnnouncementSetVersion,
  getSafeAnnouncementLink,
} from '@/lib/announcement-utils'
import { getAnnouncementColorClass } from '@/lib/colors'
import { cn } from '@/lib/utils'

const DISMISSED_VERSION_STORAGE_KEY = 'public-announcement-dismissed-version'
const ROTATION_INTERVAL_MS = 8000

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

function isCurrentAnnouncement(announcement: AnnouncementItem): boolean {
  if (
    announcement.enabled === false ||
    typeof announcement.content !== 'string' ||
    !announcement.content.trim()
  ) {
    return false
  }

  const now = Date.now()
  if (announcement.startDate) {
    const start = Date.parse(announcement.startDate)
    if (Number.isNaN(start) || now < start) return false
  }
  if (announcement.endDate) {
    const end = Date.parse(announcement.endDate)
    if (Number.isNaN(end) || now > end) return false
  }

  return true
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
  const { items } = useAnnouncements()
  const onVisibilityChange = props.onVisibilityChange
  const shouldReduceMotion = useReducedMotion() ?? false
  const [activeIndex, setActiveIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [dismissedVersion, setDismissedVersion] = useState(() =>
    readDismissedVersion()
  )

  const announcements = useMemo(
    () => items.filter(isCurrentAnnouncement),
    [items]
  )
  const announcementVersion = useMemo(
    () => getAnnouncementSetVersion(announcements),
    [announcements]
  )
  const isVisible =
    announcements.length > 0 && dismissedVersion !== announcementVersion
  const currentIndex = Math.min(
    activeIndex,
    Math.max(announcements.length - 1, 0)
  )
  const currentAnnouncement = announcements[currentIndex]
  const currentLink = getSafeAnnouncementLink(currentAnnouncement?.link)

  useEffect(() => {
    if (!announcementVersion) return
    setActiveIndex(0)
  }, [announcementVersion])

  useEffect(() => {
    if (activeIndex < announcements.length) return
    setActiveIndex(0)
  }, [activeIndex, announcements.length])

  useEffect(() => {
    onVisibilityChange?.(isVisible)
  }, [isVisible, onVisibilityChange])

  useEffect(() => {
    if (
      !isVisible ||
      announcements.length < 2 ||
      shouldReduceMotion ||
      isPaused
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % announcements.length)
    }, ROTATION_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [announcements.length, isPaused, isVisible, shouldReduceMotion])

  const goToPrevious = useCallback(() => {
    setActiveIndex((index) =>
      announcements.length > 0
        ? (index - 1 + announcements.length) % announcements.length
        : 0
    )
  }, [announcements.length])

  const goToNext = useCallback(() => {
    setActiveIndex((index) =>
      announcements.length > 0 ? (index + 1) % announcements.length : 0
    )
  }, [announcements.length])

  const handleDismiss = () => {
    setDismissedVersion(announcementVersion)
    setIsPaused(true)
    writeDismissedVersion(announcementVersion)
  }

  if (!isVisible || !currentAnnouncement) return null

  const announcementText =
    getPreviewText(currentAnnouncement.content, 180) ||
    t('Announcement content')
  const announcementKey = `${currentAnnouncement.id ?? 'announcement'}-${announcementVersion}-${currentIndex}`

  return (
    <section
      aria-label={t('System announcements')}
      className='bg-foreground text-background fixed inset-x-0 top-0 z-[60] h-[var(--public-announcement-height)] overflow-hidden shadow-[0_8px_24px_-16px_rgba(0,0,0,0.7)]'
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
          <span
            aria-hidden='true'
            className={cn(
              'size-1.5 shrink-0 rounded-full ring-2 ring-background/20',
              getAnnouncementColorClass(currentAnnouncement.type)
            )}
          />
          {announcements.length > 1 && (
            <Button
              aria-label={t('Previous announcement')}
              className='text-background hover:bg-background/10 hover:text-background focus-visible:ring-background/70'
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
            key={announcementKey}
            className='public-announcement-copy flex min-w-0 items-center justify-center gap-2'
          >
            <p className='line-clamp-2 min-w-0 text-center text-[11px] leading-4 font-medium sm:line-clamp-1 sm:text-xs'>
              {announcementText}
            </p>
            {currentLink && (
              <a
                className='decoration-background/40 hover:bg-background/10 hover:decoration-background focus-visible:ring-background/70 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold whitespace-nowrap underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:text-xs'
                href={currentLink}
                rel='noopener noreferrer'
                target='_blank'
              >
                {t('Learn more')}
                <ExternalLink aria-hidden='true' className='size-3' />
              </a>
            )}
          </div>
          {announcements.length > 1 && (
            <span className='sr-only'>
              {t('Announcement {{current}} of {{total}}', {
                current: currentIndex + 1,
                total: announcements.length,
              })}
            </span>
          )}
        </div>

        <div className='flex items-center gap-1'>
          {announcements.length > 1 && (
            <Button
              aria-label={t('Next announcement')}
              className='text-background hover:bg-background/10 hover:text-background focus-visible:ring-background/70'
              onClick={goToNext}
              size='icon-xs'
              type='button'
              variant='ghost'
            >
              <ChevronRight aria-hidden='true' />
            </Button>
          )}
          <Button
            aria-label={t('Dismiss announcement')}
            className='text-background hover:bg-background/10 hover:text-background focus-visible:ring-background/70'
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
