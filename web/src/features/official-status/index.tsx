import { useNavigate, useSearch } from '@tanstack/react-router'
import { Activity, RefreshCw, Search } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { PublicLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { PageTransition } from '@/components/page-transition'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import { useOfficialStatus } from './api'
import { ProviderCard } from './components/provider-card'
import { ProviderDetails } from './components/provider-details'
import { statusColors, statusLabel } from './status'
import type { HistoryDays, OfficialState } from './types'

type StatusFilter = Exclude<OfficialState, 'unknown'> | 'all' | 'stale'

const states: OfficialState[] = [
  'operational',
  'degraded',
  'partial_outage',
  'major_outage',
  'maintenance',
  'unknown',
]

export function OfficialStatus() {
  const search = useSearch({ from: '/official-status/' })
  const navigate = useNavigate()
  const days: HistoryDays = search.days === 30 ? 30 : 90
  return (
    <PublicLayout showMainContainer={false}>
      <PageTransition className='mx-auto w-full max-w-[1280px] px-4 pt-14 pb-12 sm:px-6 sm:pt-18 xl:px-8'>
        <OfficialStatusContent
          days={days}
          onDaysChange={(next) => {
            void navigate({ to: '/official-status', search: { days: next } })
          }}
        />
      </PageTransition>
    </PublicLayout>
  )
}

export function OfficialStatusContent(props: {
  days: HistoryDays
  onDaysChange: (days: HistoryDays) => void
}) {
  const { t } = useTranslation()
  const query = useOfficialStatus(props.days)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [selection, setSelection] = useState<{
    provider: string
    day?: string
  } | null>(null)
  const statusItems: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('All statuses') },
    ...states
      .filter((state) => state !== 'unknown')
      .map((state) => ({ value: state, label: statusLabel(t, state) })),
    { value: 'stale', label: t('Stale data') },
  ]
  const historyItems: { value: HistoryDays; label: string }[] = [
    { value: 30, label: t('30 days') },
    { value: 90, label: t('90 days') },
  ]
  const providers = (query.data?.providers ?? []).filter(
    (provider) => provider.status !== 'unknown'
  )
  const selected = providers.find(
    (provider) => provider.id === selection?.provider
  )
  const term = search.trim().toLocaleLowerCase()
  const filtered = providers.filter((provider) => {
    const matchesSearch = [
      provider.name,
      ...provider.services.flatMap((service) => [
        service.name,
        ...service.components.map((component) => component.name),
      ]),
    ].some((name) => name.toLocaleLowerCase().includes(term))
    if (!matchesSearch) return false
    if (filter === 'all') return true
    if (filter === 'stale') return provider.sync.state === 'stale'
    return provider.status === filter
  })
  const operational = providers.filter(
    (provider) =>
      provider.status === 'operational' && provider.sync.state === 'live'
  ).length
  const disrupted = providers.filter(
    (provider) =>
      !['operational', 'unknown'].includes(provider.status) &&
      provider.sync.state === 'live'
  ).length
  const stale = providers.filter(
    (provider) => provider.sync.state === 'stale'
  ).length

  return (
    <div className='space-y-7'>
      <header className='space-y-3'>
        <p className='text-muted-foreground flex items-center gap-2 text-xs font-medium tracking-wider uppercase'>
          <Activity className='size-4 text-emerald-500' aria-hidden />
          {t('Official service reports')}
        </p>
        <h1 className='text-3xl leading-tight font-semibold tracking-tight sm:text-4xl'>
          {t('Official availability')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-sm leading-relaxed sm:text-base'>
          {t(
            'API and chat service status, published by the providers themselves.'
          )}
        </p>
        <p className='text-muted-foreground text-xs'>
          {t("Independent of this site's channels and model tests.")}
        </p>
      </header>
      <dl className='bg-border grid grid-cols-2 gap-px overflow-hidden rounded-xl border sm:grid-cols-4'>
        {[
          { label: t('Providers'), value: providers.length, color: '' },
          {
            label: t('Operational'),
            value: operational,
            color: 'text-success',
          },
          {
            label: t('Service disruptions'),
            value: disrupted,
            color: 'text-warning',
          },
          {
            label: t('Stale data'),
            value: stale,
            color: 'text-muted-foreground',
          },
        ].map((item) => (
          <div key={item.label} className='bg-card px-4 py-4 sm:px-5'>
            <dt className='text-muted-foreground text-xs'>{item.label}</dt>
            <dd
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums',
                item.color
              )}
            >
              {query.data ? item.value : '—'}
            </dd>
          </div>
        ))}
      </dl>
      <div className='flex flex-wrap items-end gap-3'>
        <label className='relative min-w-0 basis-full sm:min-w-52 sm:flex-1 sm:basis-auto'>
          <span className='sr-only'>{t('Search providers or services')}</span>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-2 left-2.5 size-4'
            aria-hidden
          />
          <Input
            className='pl-9'
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('Search providers or services')}
          />
        </label>
        <Select
          items={statusItems}
          value={filter}
          onValueChange={(value) => {
            if (value !== null) setFilter(value)
          }}
        >
          <SelectTrigger
            aria-label={t('Filter by status')}
            className='min-w-0 basis-full sm:w-auto sm:basis-auto'
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent
            align='start'
            alignItemWithTrigger={false}
            className='w-max max-w-(--available-width) min-w-(--anchor-width)'
          >
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Select
          items={historyItems}
          value={props.days}
          onValueChange={(value) => {
            if (value !== null) props.onDaysChange(value)
          }}
        >
          <SelectTrigger aria-label={t('History window')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align='start' alignItemWithTrigger={false}>
            <SelectGroup>
              {historyItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          variant='outline'
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch()
          }}
        >
          <RefreshCw
            aria-hidden
            className={cn('size-4', query.isFetching && 'animate-spin')}
          />
          {t('Refresh')}
        </Button>
      </div>
      <div
        className='flex flex-wrap gap-x-4 gap-y-2'
        aria-label={t('Status legend')}
      >
        {states.map((state) => (
          <StatusBadge
            key={state}
            copyable={false}
            type='text'
            showDot
            variant={statusColors[state].badge}
            label={statusLabel(t, state)}
          />
        ))}
      </div>
      {query.isPending && (
        <div role='status'>
          <LoadingState message={t('Loading official reports...')} />
        </div>
      )}
      {query.isError && (
        <ErrorState
          className='min-h-32'
          title={t('Unable to load official availability')}
          description={
            query.data
              ? t('The refresh failed. The previous report is still displayed.')
              : undefined
          }
          onRetry={() => {
            void query.refetch()
          }}
        />
      )}
      {query.data && filtered.length === 0 && (
        <EmptyState
          title={
            providers.length
              ? t('No matching providers')
              : t('No data available')
          }
          description={
            providers.length
              ? t('Try another search or status filter.')
              : undefined
          }
        />
      )}
      <div
        className='grid min-w-0 grid-cols-1 items-stretch gap-5 lg:grid-cols-2'
        aria-label={t('Provider status cards')}
      >
        {filtered.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onDetails={(day) =>
              setSelection({ provider: provider.id, day: day?.date })
            }
          />
        ))}
      </div>
      <p className='text-muted-foreground text-center text-xs leading-relaxed'>
        {t('Sources are cached for five minutes. All dates use UTC.')}
      </p>
      {selected && (
        <ProviderDetails
          provider={selected}
          days={props.days}
          day={selection?.day}
          onDayChange={(day) => setSelection({ provider: selected.id, day })}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  )
}
