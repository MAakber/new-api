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
import { Activity, Clock3, Radio, Server } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  formatLatency,
  formatUptimePct,
  getSuccessRateDotClass,
  getSuccessRateLevel,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import { formatRankingTime, formatTokens } from '../lib/format'
import type {
  RankingAvailabilitySnapshot,
  RankingModelAvailability,
} from '../types'

type AvailabilitySectionProps = {
  snapshot?: RankingAvailabilitySnapshot
  loading: boolean
  error: boolean
}

export function AvailabilitySection(props: AvailabilitySectionProps) {
  const { t } = useTranslation()
  const summary = useMemo(() => {
    const models = props.snapshot?.models ?? []
    let requests = 0
    let successfulRequests = 0
    let healthyModels = 0
    for (const model of models) {
      requests += model.request_count
      successfulRequests += (model.success_rate / 100) * model.request_count
      if (model.success_rate >= 90) healthyModels++
    }
    return {
      models: models.length,
      requests,
      successRate: requests > 0 ? (successfulRequests / requests) * 100 : 0,
      healthyModels,
    }
  }, [props.snapshot])

  return (
    <section className='bg-card overflow-hidden rounded-xl border shadow-xs'>
      <header className='border-b px-5 py-4 sm:px-6'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div className='flex items-center gap-2'>
            <span className='relative flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'>
              <Radio className='size-4' />
              <span className='absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-950' />
            </span>
            <div>
              <h2 className='text-foreground text-base font-semibold'>
                {t('Model availability monitor')}
              </h2>
              <p className='text-muted-foreground mt-0.5 text-xs'>
                {t('Live success rates from real API traffic')}
              </p>
            </div>
          </div>
          {props.snapshot && (
            <span className='text-muted-foreground inline-flex items-center gap-1.5 text-xs'>
              <Clock3 className='size-3.5' />
              {t('Updated')} {formatRankingTime(props.snapshot.generated_at)}
            </span>
          )}
        </div>

        <div className='bg-border mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border sm:grid-cols-4'>
          <AvailabilityMetric
            icon={Server}
            label={t('Models monitored')}
            value={String(summary.models)}
          />
          <AvailabilityMetric
            icon={Activity}
            label={t('Overall success')}
            value={formatUptimePct(summary.successRate)}
            valueClassName={getSuccessRateTextClass(summary.successRate)}
          />
          <AvailabilityMetric
            icon={Radio}
            label={t('Healthy models')}
            value={`${summary.healthyModels}/${summary.models}`}
          />
          <AvailabilityMetric
            icon={Activity}
            label={t('Total requests')}
            value={formatTokens(summary.requests)}
          />
        </div>
      </header>

      <div className='p-3 sm:p-4'>
        <div className='text-muted-foreground grid grid-cols-[minmax(0,1fr)_120px] gap-3 px-3 pb-2 text-[10px] font-semibold tracking-wider uppercase sm:grid-cols-[minmax(0,1fr)_200px_100px_90px]'>
          <span>{t('Model')}</span>
          <span>{t('Success rate')}</span>
          <span className='hidden sm:block'>{t('Average latency')}</span>
          <span className='hidden text-right sm:block'>{t('Requests')}</span>
        </div>
        <AvailabilityContent
          snapshot={props.snapshot}
          loading={props.loading}
          error={props.error}
        />
      </div>
    </section>
  )
}

function AvailabilityContent(props: AvailabilitySectionProps) {
  const { t } = useTranslation()
  const models = props.snapshot?.models ?? []
  if (props.loading) {
    return (
      <div className='space-y-2'>
        {['one', 'two', 'three', 'four', 'five', 'six'].map((key) => (
          <Skeleton key={key} className='h-14 w-full rounded-lg' />
        ))}
      </div>
    )
  }
  if (props.error) {
    return <AvailabilityEmpty label={t('Unable to load availability data')} />
  }
  if (models.length === 0) {
    return (
      <AvailabilityEmpty
        label={t('No model availability data for the selected period')}
      />
    )
  }
  return (
    <div className='divide-border/60 divide-y'>
      {models.map((model) => (
        <AvailabilityRow key={model.model_name} model={model} />
      ))}
    </div>
  )
}

function AvailabilityMetric(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  valueClassName?: string
}) {
  const Icon = props.icon
  return (
    <div className='bg-card px-3 py-3 sm:px-4'>
      <span className='text-muted-foreground flex items-center gap-1.5 text-[11px]'>
        <Icon className='size-3.5' />
        {props.label}
      </span>
      <strong
        className={cn(
          'text-foreground mt-1 block font-mono text-lg tabular-nums',
          props.valueClassName
        )}
      >
        {props.value}
      </strong>
    </div>
  )
}

function AvailabilityRow(props: { model: RankingModelAvailability }) {
  const { t } = useTranslation()
  const level = getSuccessRateLevel(props.model.success_rate)
  const recentSuccessRates = props.model.recent_success_rates ?? []
  const recentRates = availabilityRateSegments(
    recentSuccessRates.length > 0
      ? recentSuccessRates
      : [props.model.success_rate]
  )
  let status = t('Critical')
  if (level === 'excellent' || level === 'good') status = t('Healthy')
  if (level === 'warning') status = t('Degraded')

  return (
    <div className='hover:bg-muted/35 grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-lg px-3 py-2.5 transition-colors sm:grid-cols-[minmax(0,1fr)_200px_100px_90px]'>
      <div className='flex min-w-0 items-center gap-2.5'>
        {getLobeIcon(props.model.vendor_icon, 22)}
        <div className='min-w-0'>
          <div className='truncate font-mono text-xs font-semibold'>
            {props.model.model_name}
          </div>
          <div className='text-muted-foreground truncate text-[11px]'>
            {props.model.vendor}
          </div>
        </div>
      </div>
      <div>
        <div className='flex items-center justify-between gap-2'>
          <span
            className={cn(
              'font-mono text-xs font-semibold tabular-nums',
              getSuccessRateTextClass(props.model.success_rate)
            )}
          >
            {formatUptimePct(props.model.success_rate)}
          </span>
          <Badge variant={level === 'critical' ? 'destructive' : 'outline'}>
            <span
              className={cn(
                'size-1.5 rounded-full',
                getSuccessRateDotClass(props.model.success_rate)
              )}
            />
            {status}
          </Badge>
        </div>
        <div
          className='mt-1.5 flex h-1.5 gap-0.5'
          title={t('Recent success rate trend')}
        >
          {recentRates.map((segment) => (
            <span
              key={segment.key}
              className={cn(
                'min-w-1 flex-1 rounded-full',
                getSuccessRateDotClass(segment.rate)
              )}
              title={formatUptimePct(segment.rate)}
            />
          ))}
        </div>
      </div>
      <span className='text-muted-foreground hidden font-mono text-xs tabular-nums sm:block'>
        {formatLatency(props.model.avg_latency_ms)}
      </span>
      <span className='text-muted-foreground hidden text-right font-mono text-xs tabular-nums sm:block'>
        {props.model.request_count.toLocaleString()}
      </span>
    </div>
  )
}

function availabilityRateSegments(rates: number[]) {
  const occurrences = new Map<number, number>()
  return rates.map((rate) => {
    const occurrence = (occurrences.get(rate) ?? 0) + 1
    occurrences.set(rate, occurrence)
    return { key: `${rate}-${occurrence}`, rate }
  })
}

function AvailabilityEmpty(props: { label: string }) {
  return (
    <div className='text-muted-foreground flex min-h-36 items-center justify-center rounded-lg border border-dashed text-sm'>
      {props.label}
    </div>
  )
}
