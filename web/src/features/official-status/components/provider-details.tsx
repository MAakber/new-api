import { ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'

import {
  incidentResolved,
  statusColors,
  statusLabel,
  statusTime,
} from '../status'
import type { HistoryDays, OfficialProvider } from '../types'
import { HistoryBar } from './history-bar'

export function ProviderDetails(props: {
  provider: OfficialProvider
  days: HistoryDays
  day?: string
  onDayChange: (day?: string) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const p = props.provider
  const day = p.history.find((item) => item.date === props.day)
  const events = props.day
    ? p.incidents.filter((event) => day?.incident_ids.includes(event.id))
    : p.incidents
  const componentNames = new Map(
    p.services.flatMap((service) =>
      service.components.map(
        (component) => [component.id, component.name] as const
      )
    )
  )
  const serviceNames = new Map(
    p.services.map((service) => [service.id, service.name])
  )

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      title={p.name}
      description={t(
        'Official announcements are shown in their original language.'
      )}
      contentClassName='sm:max-w-3xl'
      bodyClassName='space-y-6'
    >
      {p.sync.state === 'stale' && (
        <p role='status' className='text-warning text-sm'>
          {t('Sync failed. Showing the last successful report.')}
        </p>
      )}
      {props.day && (
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='space-y-1'>
            <h3 className='font-medium tabular-nums'>{props.day} · UTC</h3>
            {day && (
              <StatusBadge
                copyable={false}
                variant={statusColors[day.status].badge}
                label={statusLabel(t, day.status)}
              />
            )}
          </div>
          <Button variant='outline' onClick={() => props.onDayChange()}>
            {t('All history and components')}
          </Button>
        </div>
      )}
      {day && !day.complete && (
        <p className='text-muted-foreground text-sm'>
          {t('This day is only partially covered by official data.')}
        </p>
      )}
      {!props.day && (
        <section className='space-y-5' aria-label={t('Service components')}>
          <h3 className='font-semibold'>{t('Service components')}</h3>
          {p.services.map((service) => (
            <div
              key={service.id}
              className='space-y-3 rounded-xl border p-3 sm:p-4'
            >
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <h4 className='min-w-0 font-medium break-words'>
                  {service.name}
                </h4>
                <StatusBadge
                  copyable={false}
                  variant={statusColors[service.status].badge}
                  label={statusLabel(t, service.status)}
                  className='shrink-0'
                />
              </div>
              {service.components.length === 0 && (
                <p className='text-muted-foreground text-sm'>
                  {t('Unable to confirm from an official source.')}
                </p>
              )}
              <ul className='space-y-2'>
                {service.components.map((component) => {
                  const availability = component.availability?.find(
                    (window) => window.days === props.days
                  )
                  return (
                    <li
                      key={component.id}
                      className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm'
                    >
                      <span className='min-w-0 break-words'>
                        {component.name}
                      </span>
                      <span className='flex flex-wrap items-center justify-end gap-x-3 gap-y-1'>
                        {availability && (
                          <span
                            className='text-muted-foreground text-xs tabular-nums'
                            title={`${availability.from} – ${availability.to}`}
                          >
                            {t(
                              'Official uptime: {{percent}}% · {{days}} days',
                              {
                                percent: availability.percent.toLocaleString(
                                  toIntlLocale(i18n.language),
                                  { maximumFractionDigits: 3 }
                                ),
                                days: availability.days,
                              }
                            )}
                          </span>
                        )}
                        <StatusBadge
                          type='text'
                          copyable={false}
                          variant={statusColors[component.status].badge}
                          label={statusLabel(t, component.status)}
                          className='shrink-0'
                        />
                      </span>
                    </li>
                  )
                })}
              </ul>
              <HistoryBar
                history={service.history}
                name={service.name}
                onSelect={(selected) => props.onDayChange(selected.date)}
              />
              {service.coverage.from && service.coverage.to && (
                <p className='text-muted-foreground text-xs'>
                  {t('History coverage: {{from}} to {{to}}', {
                    from: statusTime(service.coverage.from, i18n.language),
                    to: `${statusTime(service.coverage.to, i18n.language)} UTC`,
                  })}
                </p>
              )}
              {service.history.some((item) => !item.complete) && (
                <p className='text-muted-foreground text-xs'>
                  {t('Gray days have no reliable history.')}
                </p>
              )}
              <Button
                variant='link'
                size='sm'
                role='link'
                className='h-auto p-0'
                render={
                  <a
                    href={service.url}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                {t('Official source')}
                <ArrowUpRight aria-hidden />
              </Button>
            </div>
          ))}
        </section>
      )}
      <section className='space-y-3' aria-label={t('Incident history')}>
        <h3 className='font-semibold'>{t('Incident history')}</h3>
        {events.length === 0 && (
          <EmptyState
            className='min-h-28'
            title={
              day?.complete
                ? t('No incidents reported for this day.')
                : t('No published incidents in this window.')
            }
          />
        )}
        {events.map((event) => (
          <article
            key={event.id}
            className='space-y-2 rounded-xl border p-3 sm:p-4'
          >
            <div className='flex flex-wrap items-start justify-between gap-2'>
              <h4 className='min-w-0 flex-1 text-sm leading-relaxed font-semibold break-words'>
                {event.title}
              </h4>
              <StatusBadge
                copyable={false}
                variant={
                  incidentResolved(event)
                    ? 'neutral'
                    : statusColors[event.impact].badge
                }
                label={
                  incidentResolved(event)
                    ? t('Resolved')
                    : statusLabel(t, event.impact)
                }
              />
            </div>
            <p className='text-muted-foreground text-xs tabular-nums'>
              {statusTime(event.start_at, i18n.language)} →{' '}
              {event.end_at
                ? statusTime(event.end_at, i18n.language)
                : t('Ongoing')}{' '}
              · UTC
            </p>
            <p className='text-muted-foreground text-xs break-words'>
              {event.component_ids.length || event.service_ids?.length
                ? [
                    ...event.component_ids.map(
                      (id) => componentNames.get(id) ?? id
                    ),
                    ...(event.service_ids ?? []).map(
                      (id) => serviceNames.get(id) ?? id
                    ),
                  ].join(' · ')
                : t('Provider announcement; affected products unspecified.')}
            </p>
            <p className='text-sm leading-relaxed break-words whitespace-pre-wrap'>
              {event.body}
            </p>
            {event.impacts.length > 0 && (
              <ul
                className='text-muted-foreground space-y-1 border-t pt-2 text-xs'
                aria-label={t('Reported impact intervals')}
              >
                {event.impacts.map((impact) => (
                  <li
                    key={`${impact.component_ids.join(',')}:${impact.service_ids?.join(',')}:${impact.start_at}:${impact.end_at}:${impact.status}`}
                    className='break-words'
                  >
                    {[
                      ...impact.component_ids.map(
                        (id) => componentNames.get(id) ?? id
                      ),
                      ...(impact.service_ids ?? []).map(
                        (id) => serviceNames.get(id) ?? id
                      ),
                    ].join(', ')}{' '}
                    · {statusLabel(t, impact.status)} ·{' '}
                    {statusTime(impact.start_at, i18n.language)} →{' '}
                    {impact.end_at
                      ? statusTime(impact.end_at, i18n.language)
                      : t('Ongoing')}{' '}
                    UTC
                  </li>
                ))}
              </ul>
            )}
            <Button
              variant='link'
              size='sm'
              role='link'
              className='h-auto p-0'
              render={
                <a href={event.url} target='_blank' rel='noopener noreferrer' />
              }
            >
              {t('Official announcement')}
              <ArrowUpRight aria-hidden />
            </Button>
          </article>
        ))}
      </section>
      <section
        className='space-y-2 border-t pt-4'
        aria-label={t('Data sources')}
      >
        <h3 className='text-sm font-medium'>{t('Data sources')}</h3>
        <ul className='text-muted-foreground space-y-1 text-xs'>
          {p.sources.map((source) => (
            <li key={source}>
              <a
                className='break-all underline underline-offset-2'
                href={source}
                target='_blank'
                rel='noopener noreferrer'
              >
                {source}
              </a>
            </li>
          ))}
        </ul>
        <p className='text-muted-foreground text-xs'>
          {t('Sources are cached for five minutes. All dates use UTC.')}
        </p>
      </section>
    </Dialog>
  )
}
