import type { TFunction } from 'i18next'

import type { StatusVariant } from '@/components/status-badge'
import { toIntlLocale } from '@/i18n/languages'

import type { OfficialIncident, OfficialState } from './types'

export const statusColors: Record<
  OfficialState,
  { bar: string; badge: StatusVariant }
> = {
  operational: { bar: 'bg-emerald-500 dark:bg-emerald-400', badge: 'success' },
  degraded: { bar: 'bg-amber-400 dark:bg-amber-400', badge: 'warning' },
  partial_outage: { bar: 'bg-orange-500 dark:bg-orange-400', badge: 'orange' },
  major_outage: { bar: 'bg-rose-600 dark:bg-rose-500', badge: 'danger' },
  maintenance: { bar: 'bg-blue-500 dark:bg-blue-400', badge: 'info' },
  unknown: { bar: 'bg-muted-foreground/25', badge: 'neutral' },
}

export function statusLabel(t: TFunction, state: OfficialState): string {
  switch (state) {
    case 'operational':
      return t('Operational')
    case 'degraded':
      return t('Performance degradation')
    case 'partial_outage':
      return t('Partial outage')
    case 'major_outage':
      return t('Major outage')
    case 'maintenance':
      return t('Maintenance')
    default:
      return t('Unknown')
  }
}

export function statusTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(toIntlLocale(language), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function incidentResolved(incident: OfficialIncident): boolean {
  return (
    ['resolved', 'completed', 'postmortem'].includes(incident.status) ||
    (incident.status === 'unknown' && !!incident.end_at)
  )
}
