import type { ReactNode } from 'react'

import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { cn } from '@/lib/utils'

export function DetailRow(props: {
  label: ReactNode
  value: ReactNode
  mono?: boolean
  muted?: boolean
  stacked?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 text-sm',
        props.stacked
          ? 'flex flex-col gap-1.5'
          : 'grid grid-cols-[5.25rem_minmax(0,1fr)] gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-3',
        props.className
      )}
    >
      <span className='text-muted-foreground min-w-0 text-xs'>
        {props.label}
      </span>
      <div
        className={cn(
          'max-w-full min-w-0 wrap-anywhere',
          props.stacked ? 'text-sm leading-relaxed' : 'text-xs',
          props.mono && 'font-mono',
          props.muted && 'text-muted-foreground'
        )}
      >
        {props.value}
      </div>
    </div>
  )
}

export function DetailSection(props: {
  icon?: ReactNode
  iconTone?: IconBadgeTone
  label: string
  variant?: 'default' | 'danger'
  className?: string
  children: ReactNode
}) {
  const isDanger = props.variant === 'danger'
  const iconTone = isDanger ? 'destructive' : props.iconTone
  return (
    <section className={cn('min-w-0 space-y-1.5', props.className)}>
      <h3
        className={cn(
          'flex items-center gap-1.5 text-xs font-semibold',
          isDanger && 'text-red-500'
        )}
      >
        {props.icon && (
          <IconBadge tone={iconTone} size='xs'>
            {props.icon}
          </IconBadge>
        )}
        {props.label}
      </h3>
      <div
        className={cn(
          'min-w-0 space-y-1 overflow-hidden rounded-md border p-2.5 max-sm:p-2',
          isDanger
            ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/20'
            : 'bg-muted/30'
        )}
      >
        {props.children}
      </div>
    </section>
  )
}
