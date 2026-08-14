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
import { CalendarDays, X } from 'lucide-react'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import type { Locale } from 'react-day-picker'
import { enUS, fr, ja, ru, vi, zhCN, zhTW } from 'react-day-picker/locale'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

const calendarLocales = {
  en: enUS,
  zh: zhCN,
  zhCN,
  zhTW,
  fr,
  ru,
  ja,
  vi,
} as const

interface CompactDateTimeFieldProps {
  label: string
  value?: Date
  onChange: (date: Date | undefined) => void
  calendarLocale: Partial<Locale>
}

function CompactDateTimeField({
  label,
  value,
  onChange,
  calendarLocale,
}: CompactDateTimeFieldProps) {
  const { t } = useTranslation()
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [month, setMonth] = useState<Date | undefined>(value)
  const currentYear = new Date().getFullYear()

  useEffect(() => {
    setMonth(value)
  }, [value])

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      onChange(undefined)
      setCalendarOpen(false)
      return
    }

    const nextDate = new Date(selectedDate)
    nextDate.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0)
    setMonth(nextDate)
    onChange(nextDate)
    setCalendarOpen(false)
  }

  const handleTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!value || !event.target.value) return

    const [hours, minutes] = event.target.value.split(':').map(Number)
    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return

    const nextDate = new Date(value)
    nextDate.setHours(hours, minutes, 0, 0)
    onChange(nextDate)
  }

  const handleClear = () => {
    onChange(undefined)
    setCalendarOpen(false)
  }

  return (
    <div className='min-w-0 space-y-1.5' data-slot='date-time-range-field'>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div className='grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-1.5'>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger
            render={
              <Button
                type='button'
                variant='outline'
                data-date-time-range-trigger='true'
                className={cn(
                  'min-w-0 w-full justify-between overflow-hidden px-2 text-sm leading-5 font-normal tabular-nums',
                  !value && 'text-muted-foreground'
                )}
              />
            }
          >
            <span className='truncate'>
              {value ? dayjs(value).format('YYYY-MM-DD') : t('Select date')}
            </span>
            <CalendarDays
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </PopoverTrigger>
          <PopoverContent
            align='start'
            collisionPadding={8}
            className='w-auto overflow-hidden p-0'
          >
            <Calendar
              mode='single'
              selected={value}
              month={month}
              onMonthChange={setMonth}
              captionLayout='dropdown'
              onSelect={handleDateSelect}
              locale={calendarLocale}
              startMonth={new Date(currentYear - 100, 0)}
              endMonth={new Date(currentYear + 100, 11)}
            />
          </PopoverContent>
        </Popover>
        <Input
          type='time'
          value={value ? dayjs(value).format('HH:mm') : ''}
          onChange={handleTimeChange}
          aria-label={label}
          disabled={!value}
          className='h-8 w-24 min-w-0 shrink-0 appearance-none px-2 text-sm leading-5 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none'
        />
        {value && (
          <Button
            type='button'
            variant='outline'
            size='icon'
            onClick={handleClear}
            className='shrink-0'
            aria-label={t('Clear')}
          >
            <X className='size-4' aria-hidden='true' />
          </Button>
        )}
      </div>
    </div>
  )
}

interface CompactDateTimeRangePickerProps {
  start?: Date
  end?: Date
  onChange: (range: { start?: Date; end?: Date }) => void
  className?: string
}

function cloneDate(date?: Date): Date | undefined {
  return date ? new Date(date) : undefined
}

export function CompactDateTimeRangePicker({
  start,
  end,
  onChange,
  className,
}: CompactDateTimeRangePickerProps) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [draftStart, setDraftStart] = useState<Date | undefined>(() =>
    cloneDate(start)
  )
  const [draftEnd, setDraftEnd] = useState<Date | undefined>(() =>
    cloneDate(end)
  )
  const calendarLocale =
    calendarLocales[
      (i18n.resolvedLanguage ?? i18n.language) as keyof typeof calendarLocales
    ] ?? enUS

  const label = useMemo(() => {
    if (!start && !end) return t('Date Range')
    // Keep the trigger compact while still showing the meaningful timestamp.
    const startText = start ? dayjs(start).format('YYYY-MM-DD HH:mm') : '-'
    const endText = end ? dayjs(end).format('YYYY-MM-DD HH:mm') : '-'
    return `${startText} ~ ${endText}`
  }, [end, start, t])

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftStart(cloneDate(start))
      setDraftEnd(cloneDate(end))
    }
    setOpen(nextOpen)
  }

  const applyDraft = () => {
    onChange({
      start: cloneDate(draftStart),
      end: cloneDate(draftEnd),
    })
    setOpen(false)
  }

  const applyPreset = (kind: 'today' | '7d' | 'week' | '30d' | 'month') => {
    const now = dayjs()
    const presets = {
      today: {
        start: now.startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      },
      '7d': {
        start: now.subtract(6, 'day').startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      },
      week: {
        start: now.startOf('week').toDate(),
        end: now.endOf('week').toDate(),
      },
      '30d': {
        start: now.subtract(29, 'day').startOf('day').toDate(),
        end: now.endOf('day').toDate(),
      },
      month: {
        start: now.startOf('month').toDate(),
        end: now.endOf('month').toDate(),
      },
    }
    const range = presets[kind]
    setDraftStart(range.start)
    setDraftEnd(range.end)
    onChange(range)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            className={cn(
              'min-w-0 w-full justify-start gap-2 overflow-hidden px-2.5 text-sm leading-5 font-normal tabular-nums',
              !start && !end && 'text-muted-foreground',
              className
            )}
          />
        }
      >
        <CalendarDays className='text-muted-foreground size-4 shrink-0' />
        <span className='truncate'>{label}</span>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        collisionPadding={8}
        className='max-h-[min(var(--available-height),calc(100dvh-1rem))] w-[min(520px,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] overflow-x-hidden overflow-y-auto p-3'
      >
        <div className='space-y-3'>
          <div className='grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-end'>
            <CompactDateTimeField
              label={t('Start Time')}
              value={draftStart}
              onChange={setDraftStart}
              calendarLocale={calendarLocale}
            />
            <span className='text-muted-foreground hidden pb-2 text-xs sm:block'>
              ~
            </span>
            <CompactDateTimeField
              label={t('End Time')}
              value={draftEnd}
              onChange={setDraftEnd}
              calendarLocale={calendarLocale}
            />
          </div>

          <div className='grid grid-cols-2 gap-1.5 sm:grid-cols-5'>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7 min-w-0 px-2 text-xs'
              onClick={() => applyPreset('today')}
            >
              {t('Today')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7 min-w-0 px-2 text-xs'
              onClick={() => applyPreset('7d')}
            >
              {t('7 Days')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7 min-w-0 px-2 text-xs'
              onClick={() => applyPreset('week')}
            >
              {t('This week')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7 min-w-0 px-2 text-xs'
              onClick={() => applyPreset('30d')}
            >
              {t('30 Days')}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              className='h-7 min-w-0 px-2 text-xs'
              onClick={() => applyPreset('month')}
            >
              {t('This month')}
            </Button>
          </div>

          <div className='flex justify-end'>
            <Button size='sm' className='h-8' onClick={applyDraft}>
              {t('Confirm')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
