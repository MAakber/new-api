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
import { memo } from 'react'
import { useTranslation } from 'react-i18next'

import { getSuccessRateDotClass } from '@/features/performance-metrics/lib/format'
import type { SuccessRatePoint } from '@/features/performance-metrics/types'
import { cn } from '@/lib/utils'

export type ModelPerfBadgeData = {
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  recent_success_rates?: number[]
  recent_success_series?: SuccessRatePoint[]
}

export interface ModelPerfBadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  perf: ModelPerfBadgeData | undefined
}

const STATUS_SLOTS = Array.from({ length: 24 }, (_, slot) => slot)

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return value > 1 ? String(Math.round(value)) : value.toFixed(1)
}

function formatCompactLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms >= 1_000) return `${formatCompactNumber(ms / 1_000)}s`
  return `${formatCompactNumber(ms)}ms`
}

function formatCompactThroughput(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return '—'
  if (tps >= 1_000) return `${formatCompactNumber(tps / 1_000)}Kt`
  return `${formatCompactNumber(tps)}t`
}

export const ModelPerfBadge = memo(function ModelPerfBadge(
  props: ModelPerfBadgeProps
) {
  const { t } = useTranslation()

  if (!props.perf) {
    return null
  }

  const { avg_latency_ms, avg_tps, success_rate } = props.perf

  const hasSuccessRate =
    Number.isFinite(success_rate) && success_rate >= 0 && success_rate <= 100
  const successLabel = hasSuccessRate ? `${success_rate.toFixed(1)}%` : '—'
  let statusRates: (number | undefined)[]
  if (props.perf.recent_success_series != null) {
    // Slot 23 is the current partial hour. Missing hours remain neutral.
    const currentHourStart = Math.floor(Date.now() / 1000 / 3600) * 3600
    const ratesByHour = new Map(
      props.perf.recent_success_series.map((point) => [
        point.ts,
        point.success_rate,
      ])
    )
    statusRates = STATUS_SLOTS.map((slot) =>
      ratesByHour.get(currentHourStart - (23 - slot) * 3600)
    )
  } else {
    // Older servers provide samples without timestamps; never invent hours.
    const samples = props.perf.recent_success_rates?.slice(-24) ?? []
    statusRates = [
      ...Array<undefined>(24 - samples.length).fill(undefined),
      ...samples,
    ]
  }

  return (
    <div
      className={cn(
        'hidden w-[132px] grid-cols-[38px_48px_30px] gap-x-2 text-right tabular-nums min-[460px]:grid',
        props.className
      )}
    >
      <div title={t('Average latency')} className='min-w-0'>
        <div className='text-muted-foreground/55 text-[10px] leading-4'>
          {t('Latency short')}
        </div>
        <div className='text-muted-foreground/80 font-mono text-xs leading-4 whitespace-nowrap'>
          {formatCompactLatency(avg_latency_ms)}
        </div>
      </div>
      <div title={t('Throughput')} className='min-w-0'>
        <div className='text-muted-foreground/55 truncate text-[10px] leading-4'>
          {t('Throughput short')}
        </div>
        <div className='text-muted-foreground/80 font-mono text-xs leading-4 whitespace-nowrap'>
          {formatCompactThroughput(avg_tps)}
        </div>
      </div>
      <div title={`${t('Success rate')}: ${successLabel}`} className='min-w-0'>
        <div className='text-muted-foreground/55 truncate text-[10px] leading-4'>
          {t('Status short')}
        </div>
        <div className='text-muted-foreground/80 font-mono text-xs leading-4 whitespace-nowrap'>
          {hasSuccessRate ? `${Math.round(success_rate)}%` : '—'}
        </div>
      </div>
      <div
        role='img'
        aria-label={t(
          'Recent success-rate samples; gray bars indicate missing data.'
        )}
        title={t(
          'Recent success-rate samples; gray bars indicate missing data.'
        )}
        className='col-span-3 mt-1 flex h-2 items-center justify-between'
      >
        {STATUS_SLOTS.map((slot) => {
          const rate = statusRates[slot]
          return (
            <span
              key={slot}
              aria-hidden
              className={cn(
                'h-full w-[3px] shrink-0 rounded-xs',
                rate != null &&
                  Number.isFinite(rate) &&
                  rate >= 0 &&
                  rate <= 100
                  ? getSuccessRateDotClass(rate)
                  : 'bg-muted-foreground/15'
              )}
            />
          )
        })}
      </div>
    </div>
  )
})
