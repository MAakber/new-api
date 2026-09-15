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
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { formatLogQuota, formatUseTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { UsageLog } from '../../data/schema'
import {
  getFirstResponseTimeColor,
  getResponseTimeColor,
} from '../../lib/format'
import { isTimingLogType } from '../../lib/utils'
import type { LogOtherData } from '../../types'
import { DetailRow, DetailSection } from './log-detail-layout'

const timingColors = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
} as const

export function LogOverview(props: {
  log: UsageLog
  other: LogOtherData | null
  isAdmin: boolean
}) {
  const { t } = useTranslation()
  const log = props.log
  const other = props.other
  const showTiming = isTimingLogType(log.type)
  const channelChain = other?.admin_info?.use_channel?.join(' → ')
  const group = log.group || other?.group
  const identifiers = [
    { label: t('Request ID'), value: log.request_id },
    { label: t('Upstream Request ID'), value: log.upstream_request_id },
  ].filter((field) => field.value)
  const showBasicInfo =
    identifiers.length > 0 ||
    (props.isAdmin && (log.channel > 0 || channelChain)) ||
    log.token_name ||
    group ||
    (props.isAdmin && log.ip && log.type !== 7)

  if (!showTiming && !showBasicInfo) return null

  return (
    <div className='flex min-w-0 flex-col gap-5 md:col-span-2'>
      {showTiming && (
        <dl className='bg-muted/30 grid min-w-0 grid-cols-2 gap-5 rounded-lg border p-4 sm:grid-cols-4'>
          <div className='flex min-w-0 flex-col gap-2'>
            <dt className='text-muted-foreground text-xs'>{t('Model')}</dt>
            <dd className='text-sm leading-relaxed font-semibold wrap-anywhere'>
              {log.model_name || '—'}
            </dd>
            <StatusBadge
              label={log.is_stream ? t('Streaming') : t('Non-streaming')}
              variant='neutral'
              size='sm'
              copyable={false}
              className='w-fit'
            />
          </div>
          <div className='flex min-w-0 flex-col gap-2'>
            <dt className='text-muted-foreground text-xs'>{t('Cost')}</dt>
            <dd className='font-mono text-lg font-semibold wrap-anywhere tabular-nums'>
              {formatLogQuota(log.quota)}
            </dd>
          </div>
          <div className='flex min-w-0 flex-col gap-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Response Time')}
            </dt>
            <dd
              className={cn(
                'font-mono text-lg font-semibold tabular-nums',
                log.use_time > 0 &&
                  timingColors[
                    getResponseTimeColor(log.use_time, log.completion_tokens)
                  ]
              )}
            >
              {log.use_time > 0 ? formatUseTime(log.use_time) : '—'}
            </dd>
            {log.is_stream && other?.frt != null && other.frt > 0 && (
              <dd className='text-muted-foreground flex flex-wrap gap-x-1 text-xs'>
                {t('First response')}
                <span
                  className={cn(
                    'font-mono',
                    timingColors[getFirstResponseTimeColor(other.frt / 1000)]
                  )}
                >
                  {formatUseTime(other.frt / 1000)}
                </span>
              </dd>
            )}
          </div>
          <div className='flex min-w-0 flex-col gap-2'>
            <dt className='text-muted-foreground text-xs'>
              {t('Total Tokens')}
            </dt>
            <dd className='font-mono text-lg font-semibold wrap-anywhere tabular-nums'>
              {(log.prompt_tokens + log.completion_tokens).toLocaleString()}
            </dd>
          </div>
        </dl>
      )}

      {showBasicInfo && (
        <DetailSection label={t('Basic Information')}>
          <div className='flex min-w-0 flex-col gap-4 p-1'>
            {identifiers.length > 0 && (
              <div className='flex min-w-0 flex-col gap-3'>
                {identifiers.map((field) => (
                  <DetailRow
                    key={field.label}
                    label={field.label}
                    value={
                      <div className='flex min-w-0 items-start gap-2'>
                        <span className='min-w-0 flex-1 wrap-anywhere'>
                          {field.value}
                        </span>
                        <CopyButton
                          value={field.value}
                          aria-label={t('Copy {{field}}', {
                            field: field.label,
                          })}
                          className='-my-1 size-8'
                        />
                      </div>
                    }
                    mono
                  />
                ))}
              </div>
            )}
            <div className='grid min-w-0 grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3'>
              {props.isAdmin && log.channel > 0 && (
                <DetailRow
                  label={t('Channel')}
                  value={
                    <>
                      <span className='font-mono'>{log.channel}</span>
                      {log.channel_name && (
                        <span className='text-muted-foreground'>
                          {' '}
                          · {log.channel_name}
                        </span>
                      )}
                    </>
                  }
                  stacked
                />
              )}
              {channelChain && props.isAdmin && (
                <DetailRow
                  label={t('Retry Chain')}
                  value={channelChain}
                  mono
                  stacked
                />
              )}
              {log.token_name && (
                <DetailRow
                  label={t('Token')}
                  value={log.token_name}
                  mono
                  stacked
                />
              )}
              {group && (
                <DetailRow label={t('Group')} value={group} mono stacked />
              )}
              {props.isAdmin && log.ip && log.type !== 7 && (
                <DetailRow
                  label={t('IP Address')}
                  value={log.ip}
                  mono
                  stacked
                />
              )}
            </div>
          </div>
        </DetailSection>
      )}
    </div>
  )
}
