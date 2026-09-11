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
  const latencyText = formatCompactLatency(props.perf?.avg_latency_ms ?? 0)
  const throughputText = formatCompactThroughput(props.perf?.avg_tps ?? 0)
  const successRate = props.perf?.success_rate
  const hasSuccessRate =
    successRate != null &&
    Number.isFinite(successRate) &&
    successRate >= 0 &&
    successRate <= 100
  let statusRates: (number | undefined)[]
  if (props.perf?.recent_success_series != null) {
    // Slot 23 is the current partial hour. Missing hours remain neutral.
    const currentHourStart = Math.floor(Date.now() / 1000 / 3600) * 3600
    const ratesByHour = new Map(
      props.perf?.recent_success_series.map((point) => [
        point.ts,
        point.success_rate,
      ])
    )
    statusRates = STATUS_SLOTS.map((slot) =>
      ratesByHour.get(currentHourStart - (23 - slot) * 3600)
    )
  } else {
    // Older servers provide samples without timestamps; never invent hours.
    const samples = props.perf?.recent_success_rates?.slice(-24) ?? []
    statusRates = [
      ...Array<undefined>(24 - samples.length).fill(undefined),
      ...samples,
    ]
  }

  return (
    <div
      aria-label={t('Performance metrics for the last 24 hours')}
      className={cn(
        'flex w-full min-w-0 items-center justify-between gap-3',
        props.className
      )}
    >
      <dl className='flex min-w-0 items-start gap-5 text-xs tabular-nums'>
        <div className='w-24 shrink-0'>
          <dt
            title={t('Request success rate sampled over the last 24 hours')}
            className='text-muted-foreground flex items-center justify-between gap-1 text-[11px] leading-4'
          >
            <span>{t('Status')}</span>
            <span className='font-mono'>
              {hasSuccessRate ? `${successRate.toFixed(1)}%` : '—%'}
            </span>
          </dt>
          <dd
            role='img'
            aria-label={t(
              'Recent success-rate samples; gray bars indicate missing data.'
            )}
            title={t(
              'Recent success-rate samples; gray bars indicate missing data.'
            )}
            className='mt-1 flex h-3 w-24 items-center justify-between'
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
          </dd>
        </div>
        <div title={t('Average latency')} className='shrink-0'>
          <dt className='text-muted-foreground text-[11px] leading-4'>
            {t('Latency short')}
          </dt>
          <dd className='mt-1 font-mono whitespace-nowrap'>
            {latencyText === '—' ? '—s' : latencyText}
          </dd>
        </div>
        <div title={t('Throughput')} className='shrink-0'>
          <dt className='text-muted-foreground text-[11px] leading-4'>
            {t('Throughput short')}
          </dt>
          <dd className='mt-1 font-mono whitespace-nowrap'>
            {throughputText === '—' ? '—t/s' : throughputText}
          </dd>
        </div>
      </dl>
      {props.children}
    </div>
  )
})
