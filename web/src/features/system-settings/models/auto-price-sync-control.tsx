import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AutoSyncStatusStrip } from '@/components/auto-sync-status-strip'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import type { PricingSourceDescriptor } from '@/types/auto-sync'

import {
  getAutoPriceSyncStatus,
  getUpstreamChannels,
  updateAutoPriceSyncConfig,
} from '../api'
import type { UpstreamChannel } from '../types'
import {
  DEFAULT_ENDPOINT,
  MODELS_DEV_PRESET_ID,
  OFFICIAL_CHANNEL_ID,
  OPENROUTER_CHANNEL_TYPE,
  OPENROUTER_ENDPOINT,
} from './constants'

function sourceKey(source?: PricingSourceDescriptor) {
  if (source?.kind === 'official') return String(OFFICIAL_CHANNEL_ID)
  if (source?.kind === 'models_dev') return String(MODELS_DEV_PRESET_ID)
  return source?.channel_id ? String(source.channel_id) : ''
}

function sourceForChannel(channel: UpstreamChannel): PricingSourceDescriptor {
  if (channel.id === OFFICIAL_CHANNEL_ID) return { kind: 'official' }
  if (channel.id === MODELS_DEV_PRESET_ID) return { kind: 'models_dev' }
  const endpoint =
    channel.type === OPENROUTER_CHANNEL_TYPE
      ? OPENROUTER_ENDPOINT
      : DEFAULT_ENDPOINT
  return {
    kind: 'real_channel',
    channel_id: channel.id,
    channel_type: channel.type ?? 0,
    resolved_base_url: channel.base_url,
    endpoint,
  }
}

function resultNumber(
  result: Record<string, unknown> | undefined,
  key: string
) {
  const value = result?.[key]
  return typeof value === 'number' ? value : 0
}

function resultListLength(
  result: Record<string, unknown> | undefined,
  key: string
) {
  const value = result?.[key]
  return Array.isArray(value) ? value.length : 0
}

export function AutoPriceSyncControl() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isRoot = useAuthStore(
    (state) => state.auth.user?.role === ROLE.SUPER_ADMIN
  )
  const [enabled, setEnabled] = useState(false)
  const [selectedSource, setSelectedSource] = useState('')

  const statusQuery = useQuery({
    queryKey: ['auto-price-sync-status'],
    queryFn: getAutoPriceSyncStatus,
    enabled: isRoot,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status
      return status?.running || status?.pending_events ? 5000 : 30000
    },
  })
  const channelsQuery = useQuery({
    queryKey: ['upstream-channels'],
    queryFn: getUpstreamChannels,
    enabled: isRoot,
  })
  const channels = useMemo(
    () => channelsQuery.data?.data ?? [],
    [channelsQuery.data?.data]
  )

  useEffect(() => {
    const config = statusQuery.data?.data?.config
    if (!config) return
    setEnabled(config.enabled)
    setSelectedSource(sourceKey(config.source))
  }, [statusQuery.data?.data?.config])

  const saveMutation = useMutation({
    mutationFn: () => {
      const channel = channels.find(
        (item) => String(item.id) === selectedSource
      )
      if (enabled && !channel) {
        throw new Error(
          t('Select a price source before enabling automatic sync')
        )
      }
      return updateAutoPriceSyncConfig({
        enabled,
        source: channel ? sourceForChannel(channel) : undefined,
      })
    },
    onSuccess: (response) => {
      queryClient.setQueryData(['auto-price-sync-status'], response)
      toast.success(t('Automatic sync configuration saved'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!isRoot) return null
  const view = statusQuery.data?.data
  const result = view?.status?.latest?.result
  const summary = [
    { label: t('Prices filled'), value: resultNumber(result, 'prices_filled') },
    {
      label: t('Channels kept'),
      value: resultListLength(result, 'retained_channels'),
    },
    {
      label: t('Channels deleted'),
      value: resultListLength(result, 'deleted_channels'),
    },
  ]
  const selectedLabel =
    channels.find((item) => String(item.id) === selectedSource)?.name ??
    t('Fixed price source')

  return (
    <div className='flex shrink-0 flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-3'>
        <label className='flex items-center gap-2 text-sm font-medium'>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          {t('Automatic price sync')}
        </label>
        <Select
          items={channels.map((channel) => ({
            value: String(channel.id),
            label: channel.name,
          }))}
          value={selectedSource || null}
          onValueChange={(value) => setSelectedSource(value ?? '')}
        >
          <SelectTrigger className='w-full sm:w-64'>
            <SelectValue>{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            <SelectGroup>
              {channels.map((channel) => (
                <SelectItem key={channel.id} value={String(channel.id)}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          size='sm'
          variant='outline'
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || statusQuery.isLoading}
        >
          <Save className='size-4' />
          {t('Save')}
        </Button>
      </div>
      <AutoSyncStatusStrip
        enabled={view?.config.enabled ?? false}
        status={view?.status}
        summary={summary}
      />
    </div>
  )
}
