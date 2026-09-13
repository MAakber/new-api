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
import type { TFunction } from 'i18next'
import {
  ArrowDownToLineIcon,
  ArrowUpFromLineIcon,
  ClockIcon,
  DatabaseIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { toIntlLocale } from '@/i18n/languages'
import { cn } from '@/lib/utils'

import type { MessageAlignment } from '../../lib'
import type { Message } from '../../types'

type MessageMetadataProps = {
  alignment: MessageAlignment
  message: Message
}

function formatMessageTime(timestamp?: number): string | undefined {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return undefined
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp))
}

function formatDuration(
  durationMs: number | undefined,
  t: TFunction
): string | undefined {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) {
    return undefined
  }

  if (durationMs < 1000) {
    return t('{{value}}ms', { value: Math.max(1, Math.round(durationMs)) })
  }

  return t('{{value}}s', { value: (durationMs / 1000).toFixed(2) })
}

export function MessageMetadata(props: MessageMetadataProps) {
  const { t, i18n } = useTranslation()
  const messageTime = formatMessageTime(props.message.createdAt)
  const duration = formatDuration(props.message.durationMs, t)
  const usage = props.message.run?.usage
  const number = new Intl.NumberFormat(toIntlLocale(i18n.resolvedLanguage))
  const value = (count?: number) =>
    count === undefined ? '—' : number.format(count)
  const toolCount = props.message.run?.tool_calls.length
  const stats: { label: string; value: string; icon: LucideIcon }[] = [
    { label: t('Response time'), value: duration ?? '—', icon: ClockIcon },
    {
      label: t('Input tokens'),
      value: value(usage?.input_tokens),
      icon: ArrowDownToLineIcon,
    },
    {
      label: t('Output tokens'),
      value: value(usage?.output_tokens),
      icon: ArrowUpFromLineIcon,
    },
    {
      label: t('Cached tokens'),
      value: value(usage?.cached_tokens),
      icon: DatabaseIcon,
    },
    { label: t('MCP tool calls'), value: value(toolCount), icon: WrenchIcon },
  ]
  const tokenRate =
    usage?.output_tokens !== undefined &&
    usage.generation_duration_ms &&
    usage.generation_duration_ms > 0
      ? t('{{value}} token/s', {
          value: (
            usage.output_tokens /
            (usage.generation_duration_ms / 1000)
          ).toFixed(1),
        })
      : t('Not reported')

  if (!messageTime && !duration && !props.message.run) {
    return null
  }

  return (
    <div
      className={cn(
        'text-muted-foreground mt-1 flex min-h-4 flex-wrap items-center gap-1.5 text-[11px] leading-none',
        props.alignment === 'right' && 'justify-end'
      )}
    >
      {messageTime && <time>{messageTime}</time>}
      {props.message.from === 'assistant' &&
        (duration || props.message.run) && (
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        variant='ghost'
                        className='text-muted-foreground h-auto max-w-full flex-wrap justify-start gap-x-3 gap-y-2 px-1.5 py-1 text-[11px] font-normal tabular-nums'
                        aria-label={t('Message statistics')}
                      >
                        {stats.map((stat) => (
                          <span
                            key={stat.label}
                            className='inline-flex items-center gap-1'
                          >
                            <stat.icon aria-hidden='true' className='size-3' />
                            <span className='sr-only'>{stat.label}: </span>
                            {stat.value}
                          </span>
                        ))}
                      </Button>
                    }
                  />
                }
              />
              <TooltipContent>
                {t('View timing, token usage and tool details')}
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              align='start'
              className='w-80 max-w-[calc(100vw-2rem)] space-y-3 text-xs'
            >
              <p className='font-medium'>{t('Message statistics')}</p>
              <dl className='grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 tabular-nums'>
                {[
                  ...stats,
                  {
                    label: t('Total tokens'),
                    value: value(usage?.total_tokens),
                  },
                  {
                    label: t('Cache write tokens'),
                    value: value(usage?.cache_write_tokens),
                  },
                  {
                    label: t('Reasoning tokens'),
                    value: value(usage?.reasoning_tokens),
                  },
                  {
                    label: t('Time to first token'),
                    value: formatDuration(usage?.first_token_ms, t) ?? '—',
                  },
                  { label: t('Generation speed'), value: tokenRate },
                  { label: t('Model rounds'), value: value(usage?.rounds) },
                ].map((stat) => (
                  <div key={stat.label} className='contents'>
                    <dt className='text-muted-foreground'>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
              <p className='text-muted-foreground'>
                {t(
                  'Cached tokens are part of input tokens. Reasoning tokens are part of output tokens. Missing values are not reported by the provider.'
                )}
              </p>
              {usage?.estimated && (
                <p>{t('Token usage includes estimates.')}</p>
              )}
              {usage?.partial && (
                <p>{t('Some model rounds did not report complete usage.')}</p>
              )}
              {props.message.run?.search_mode === 'native' && (
                <p>
                  {t(
                    'Native search runs at the model provider; MCP tool counts exclude native search calls.'
                  )}
                </p>
              )}
            </PopoverContent>
          </Popover>
        )}
    </div>
  )
}
