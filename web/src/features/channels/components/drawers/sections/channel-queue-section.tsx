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
import { useQuery } from '@tanstack/react-query'
import { Gauge, Zap } from 'lucide-react'
import { useEffect } from 'react'
import type { Control } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

import { getChannelQueueStatus } from '../../../api'
import type { ChannelFormValues } from '../../../lib/channel-form'
import type { ChannelQueueStatusView } from '../../../types'

type ChannelQueueSectionProps = {
  control: Control<ChannelFormValues>
  disabled: boolean
  channelId?: number
}

const ENDPOINT_OPTIONS = [
  { value: '', labelKey: 'Auto detect' },
  { value: 'openai', labelKey: 'OpenAI Chat' },
  { value: 'openai-response', labelKey: 'OpenAI Responses' },
  { value: 'openai-response-compact', labelKey: 'OpenAI Responses Compact' },
  { value: 'anthropic', labelKey: 'Anthropic Messages' },
  { value: 'gemini', labelKey: 'Gemini' },
  { value: 'embeddings', labelKey: 'Embeddings' },
  { value: 'image-generation', labelKey: 'Image Generation' },
  { value: 'jina-rerank', labelKey: 'Rerank' },
]

function numberOnChange(value: string): number {
  if (value === '') return 0
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : 0
}

function formatStatusTime(seconds: number | undefined): string {
  if (!seconds) return ''
  const d = new Date(seconds * 1000)
  return d.toLocaleString()
}

function QueueStatusBadge({ status }: { status: ChannelQueueStatusView }) {
  const { t } = useTranslation()
  if (status.breaker_active) {
    return (
      <span className='text-warning text-xs font-medium'>
        {t('Breaker active')}
      </span>
    )
  }
  if (status.warming) {
    return <span className='text-info text-xs font-medium'>{t('Warming')}</span>
  }
  if (status.last_result === 'ok') {
    return (
      <span className='text-success text-xs font-medium'>{t('Healthy')}</span>
    )
  }
  return <span className='text-muted-foreground text-xs'>{t('Idle')}</span>
}

export function ChannelQueueSection({
  control,
  disabled,
  channelId,
}: ChannelQueueSectionProps) {
  const { t } = useTranslation()
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['channels', 'queue-status'],
    queryFn: getChannelQueueStatus,
    refetchInterval: 10_000,
    enabled: channelId != null,
  })
  const status =
    channelId != null
      ? (data?.data ?? []).find((s) => s.channel_id === channelId)
      : undefined

  useEffect(() => {
    if (channelId != null) {
      void refetch()
    }
  }, [channelId, refetch])

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center gap-2'>
        <Zap className='text-info h-4 w-4' aria-hidden='true' />
        <span className='text-[13px] font-semibold'>
          {t('Auto Upstream Queue')}
        </span>
      </div>

      {status && (
        <div className='bg-muted/40 flex flex-col gap-1 rounded-lg border p-3 text-xs'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground'>{t('Warmer status')}</span>
            <QueueStatusBadge status={status} />
          </div>
          {status.model && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('Queue Model')}</span>
              <span>{status.model}</span>
            </div>
          )}
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground'>
              {t('Consecutive failures')}
            </span>
            <span>{status.consecutive_failures}</span>
          </div>
          {status.last_result && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('Last result')}</span>
              <span className='max-w-[60%] truncate' title={status.last_result}>
                {status.last_result}
              </span>
            </div>
          )}
          {status.last_warm_at != null && status.last_warm_at > 0 && (
            <div className='flex items-center justify-between'>
              <span className='text-muted-foreground'>{t('Last warm-up')}</span>
              <span>{formatStatusTime(status.last_warm_at)}</span>
            </div>
          )}
          {status.breaker_active && status.breaker_until != null && (
            <div className='flex items-center justify-between'>
              <span className='text-warning'>
                {t('Breaker recovers at')}{' '}
                {formatStatusTime(status.breaker_until)}
              </span>
            </div>
          )}
          {isFetching && (
            <span className='text-muted-foreground'>{t('Refreshing...')}</span>
          )}
        </div>
      )}

      <FormField
        control={control}
        name='queue_enabled'
        render={({ field }) => (
          <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <FormLabel>{t('Enable Queue Warmer')}</FormLabel>
              <FormDescription>
                {t(
                  'Periodically send warm-up calls to hold an upstream queue slot so real requests do not have to re-queue.'
                )}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value === true}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name='queue_model'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Queue Model')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Model name to keep queued')}
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormDescription>
              {t(
                'One channel warms exactly one model. To warm multiple models, configure separate channels.'
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={control}
          name='queue_interval'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Interval (s)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={1}
                  placeholder='30'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name='queue_timeout'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Timeout (s)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  placeholder='25'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={control}
          name='queue_endpoint_type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Endpoint Type')}</FormLabel>
              <Select
                value={field.value || ''}
                onValueChange={(v) => field.onChange(v === 'auto' ? '' : v)}
                disabled={disabled}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Auto detect')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ENDPOINT_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value || 'auto'}
                      value={opt.value || 'auto'}
                    >
                      {t(opt.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name='queue_max_tokens'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Max Tokens')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={1}
                  placeholder='16'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                {t('Cap warm-up request size to control cost.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name='queue_warmup_message'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Warm-up Message')}</FormLabel>
            <FormControl>
              <Input
                placeholder={t('Leave empty to use the default test message')}
                {...field}
                disabled={disabled}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='flex items-center gap-2 pt-2'>
        <Gauge className='text-warning h-4 w-4' aria-hidden='true' />
        <span className='text-[13px] font-semibold'>
          {t('Circuit Breaker')}
        </span>
      </div>

      <FormField
        control={control}
        name='queue_circuit_breaker_enabled'
        render={({ field }) => (
          <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
            <div className='space-y-0.5'>
              <FormLabel>{t('Enable Circuit Breaker')}</FormLabel>
              <FormDescription>
                {t(
                  'Queue-busy responses (429/503) never trip the breaker. Only genuine failures pause warming; real requests are never affected.'
                )}
              </FormDescription>
            </div>
            <FormControl>
              <Switch
                checked={field.value !== false}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={control}
          name='queue_max_consecutive_failures'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Max Consecutive Failures')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  placeholder='10'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name='queue_cooldown_seconds'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Cooldown (s)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  placeholder='300'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        <FormField
          control={control}
          name='queue_backoff_seconds'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Backoff (s)')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  placeholder='30'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                {t('Wait between squeeze attempts when the queue is busy.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name='queue_max_queue_attempts'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Max Queue Attempts')}</FormLabel>
              <FormControl>
                <Input
                  type='number'
                  min={0}
                  placeholder='0'
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(numberOnChange(e.target.value))
                  }
                  disabled={disabled}
                />
              </FormControl>
              <FormDescription>
                {t('0 = unlimited squeeze attempts per round.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name='queue_busy_status_codes'
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('Queue-Busy Status Codes')}</FormLabel>
            <FormControl>
              <Input placeholder='429,503' {...field} disabled={disabled} />
            </FormControl>
            <FormDescription>
              {t(
                'Comma-separated HTTP status codes treated as "queue busy" (never trip the breaker).'
              )}
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}
