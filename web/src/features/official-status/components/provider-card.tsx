import { ArrowUpRight, Clock3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { getLobeIcon } from '@/lib/lobe-icon'

import {
  incidentResolved,
  statusColors,
  statusLabel,
  statusTime,
} from '../status'
import type { OfficialDay, OfficialProvider, OfficialService } from '../types'
import { HistoryBar } from './history-bar'

// The kind tag marks where an entry comes from on the official status page:
// an API endpoint or a chat product. `other` has no tag.
function serviceKindLabel(
  kind: OfficialService['kind'],
  chatLabel: string
): string | undefined {
  if (kind === 'api') return 'API'
  if (kind === 'chat') return chatLabel
  return undefined
}

export function ProviderCard(props: {
  provider: OfficialProvider
  onDetails: (day?: OfficialDay) => void
}) {
  const { t, i18n } = useTranslation()
  const p = props.provider
  const active = p.incidents.filter(
    (event) => !incidentResolved(event) && event.status !== 'scheduled'
  )
  const stale = p.sync.state === 'stale'
  const unavailable =
    p.sync.state === 'unavailable' || p.sync.state === 'unconfigured'

  return (
    <Card
      data-card-hover='false'
      className='min-w-0 gap-0 overflow-hidden py-0'
      aria-labelledby={`provider-${p.id}`}
    >
      <CardHeader className='flex flex-row items-center justify-between gap-3 p-5 pb-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <span
            aria-hidden
            className='bg-muted/50 flex size-10 shrink-0 items-center justify-center rounded-xl'
          >
            {getLobeIcon(p.icon, 25)}
          </span>
          <h2
            id={`provider-${p.id}`}
            className='min-w-0 text-lg font-semibold break-words'
          >
            {p.name}
          </h2>
        </div>
        <StatusBadge
          variant={statusColors[p.status].badge}
          copyable={false}
          className='h-auto max-w-[55%] text-right whitespace-normal'
          label={statusLabel(t, p.status)}
        />
      </CardHeader>
      <CardContent className='space-y-4 px-5 pb-4'>
        <dl className='divide-border/60 divide-y'>
          {p.services.map((service) => {
            const kindLabel = serviceKindLabel(service.kind, t('Chat'))
            return (
              <div
                key={service.id}
                className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 first:pt-0'
              >
                <dt className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
                  <span className='min-w-0 break-words'>{service.name}</span>
                  {kindLabel && (
                    <span className='bg-muted text-muted-foreground inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[11px] leading-none'>
                      {kindLabel}
                    </span>
                  )}
                </dt>
                <dd className='justify-self-end'>
                  <StatusBadge
                    type='text'
                    copyable={false}
                    variant={statusColors[service.status].badge}
                    label={statusLabel(t, service.status)}
                    className='h-auto'
                  />
                </dd>
              </div>
            )
          })}
        </dl>
        {(stale || unavailable) && (
          <p
            role='status'
            className='bg-muted/50 text-muted-foreground rounded-lg px-3 py-2 text-xs leading-relaxed'
          >
            {stale
              ? t('Sync failed. Showing the last successful report.')
              : t('Unable to confirm from an official source.')}
            {p.sync.error === 'source_format_changed' &&
              ` ${t('The official source format has changed.')}`}
          </p>
        )}
        <HistoryBar
          history={p.history}
          name={p.name}
          onSelect={props.onDetails}
        />
        {p.history.some((day) => !day.complete) && (
          <p className='text-muted-foreground text-xs'>
            {t('Gray days have no reliable history.')}
          </p>
        )}
        {active.length > 0 && (
          <div className='border-warning/30 bg-warning/5 space-y-1 rounded-lg border px-3 py-2'>
            <p className='text-xs font-medium'>{t('Active incidents')}</p>
            {active.slice(0, 2).map((event) => (
              <p key={event.id} className='line-clamp-2 text-sm break-words'>
                {event.title}
              </p>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className='bg-muted/20 mt-auto flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3'>
        <p className='text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs'>
          <Clock3 className='size-3.5 shrink-0' aria-hidden />
          {p.sync.last_success_at
            ? t('Synced {{time}}', {
                time: `${statusTime(p.sync.last_success_at, i18n.language)} UTC`,
              })
            : t('Not yet synced')}
          {stale && (
            <StatusBadge
              variant='warning'
              copyable={false}
              label={t('Stale data')}
            />
          )}
        </p>
        <div className='flex flex-wrap gap-1'>
          <Button variant='ghost' size='sm' onClick={() => props.onDetails()}>
            {t('Details')}
          </Button>
          <Button
            variant='ghost'
            size='sm'
            role='link'
            render={
              <a href={p.url} target='_blank' rel='noopener noreferrer' />
            }
          >
            {t('Official source')}
            <ArrowUpRight aria-hidden className='size-3.5' />
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
