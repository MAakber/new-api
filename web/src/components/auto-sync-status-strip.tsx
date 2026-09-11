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
import { Activity, AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { formatTimestampRelative, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AutoSyncStatus } from '@/types/auto-sync'

type AutoSyncStatusStripProps = {
  status?: AutoSyncStatus
  enabled: boolean
  summary?: Array<{ label: string; value: number }>
  className?: string
}

export function AutoSyncStatusStrip({
  status,
  enabled,
  summary = [],
  className,
}: AutoSyncStatusStripProps) {
  const { t } = useTranslation()
  const active = status?.running
  const latest = status?.latest
  const error = active?.error || latest?.error
  const state = active?.status ?? latest?.status
  let statusIcon = <Activity className='text-primary size-4' />
  if (state === 'failed') {
    statusIcon = <AlertTriangle className='text-destructive size-4' />
  } else if (state === 'succeeded') {
    statusIcon = (
      <CheckCircle2 className='size-4 text-emerald-600 dark:text-emerald-400' />
    )
  }

  let timing = (
    <span className='text-muted-foreground'>
      {t('No automatic sync runs yet')}
    </span>
  )
  if (active) {
    timing = (
      <span className='flex items-center gap-1.5'>
        <span className='bg-primary size-1.5 animate-pulse rounded-full' />
        {t(active.status === 'pending' ? 'Pending' : 'Running')}
      </span>
    )
  } else if (status?.due_at) {
    timing = (
      <span
        className='text-muted-foreground flex items-center gap-1.5'
        title={formatTimestampToDate(status.due_at)}
      >
        <Clock3 className='size-3.5' />
        {t('Next run')}: {formatTimestampRelative(status.due_at)}
      </span>
    )
  } else if (latest) {
    timing = (
      <span
        className='text-muted-foreground'
        title={formatTimestampToDate(latest.updated_at)}
      >
        {t('Last run')}: {formatTimestampRelative(latest.updated_at)}
      </span>
    )
  }

  return (
    <div
      className={cn(
        'border-border/70 bg-muted/30 flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2 text-xs',
        className
      )}
    >
      <div className='flex items-center gap-2 font-medium'>
        {statusIcon}
        <span>{t('Auto sync status')}</span>
        <Badge variant={enabled ? 'default' : 'secondary'}>
          {t(enabled ? 'Enabled' : 'Disabled')}
        </Badge>
      </div>

      <span className='text-muted-foreground'>
        {t('Pending events')}: {status?.pending_events ?? 0}
      </span>

      {timing}

      {summary.map((item) => (
        <span key={item.label} className='text-muted-foreground'>
          {item.label}:{' '}
          <strong className='text-foreground'>{item.value}</strong>
        </span>
      ))}

      {error ? (
        <span
          className='text-destructive min-w-0 basis-full truncate'
          title={error}
        >
          {error}
        </span>
      ) : null}
    </div>
  )
}
