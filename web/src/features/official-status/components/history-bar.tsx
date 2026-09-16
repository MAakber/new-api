import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { statusColors, statusLabel } from '../status'
import type { OfficialDay } from '../types'

// Shared chart components do not cover discrete UTC days with gaps and a
// keyboard-operable day selector. Controls and dialogs remain shared UI.
export function HistoryBar(props: {
  history: OfficialDay[]
  name: string
  onSelect: (day: OfficialDay) => void
}) {
  const { t } = useTranslation()
  const [focused, setFocused] = useState(props.history.length - 1)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const active = Math.min(focused, props.history.length - 1)

  return (
    <div className='min-w-0 space-y-2'>
      <div
        role='toolbar'
        aria-label={t('Daily history for {{name}}', { name: props.name })}
        className='flex h-8 w-full min-w-0 gap-px'
      >
        {props.history.map((day, index) => {
          const label = `${day.date} UTC: ${statusLabel(t, day.status)}${day.complete ? '' : ` · ${t('Incomplete history')}`}`
          return (
            <Button
              key={day.date}
              ref={(node) => {
                buttons.current[index] = node
              }}
              type='button'
              variant='ghost'
              aria-label={label}
              title={label}
              tabIndex={index === active ? 0 : -1}
              onFocus={() => setFocused(index)}
              onClick={() => props.onSelect(day)}
              onKeyDown={(event) => {
                let next = index
                if (event.key === 'ArrowLeft') {
                  next = Math.max(0, index - 1)
                } else if (event.key === 'ArrowRight') {
                  next = Math.min(props.history.length - 1, index + 1)
                } else if (event.key === 'Home') {
                  next = 0
                } else if (event.key === 'End') {
                  next = props.history.length - 1
                } else {
                  return
                }
                event.preventDefault()
                buttons.current[next]?.focus()
              }}
              className={cn(
                'h-full min-w-0 flex-1 shrink rounded-xs border-0 p-0 transition-opacity hover:opacity-70 focus-visible:z-10 focus-visible:ring-2',
                statusColors[day.status].bar
              )}
            />
          )
        })}
      </div>
      <div className='text-muted-foreground flex justify-between gap-2 text-[11px] tabular-nums'>
        <span>{props.history[0]?.date}</span>
        <span>{props.history.at(-1)?.date} · UTC</span>
      </div>
    </div>
  )
}
