import { useQuery } from '@tanstack/react-query'
import { Puzzle, Server } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ProviderBadge } from '@/components/provider-badge'
import { StatusBadge } from '@/components/status-badge'
import { PluginIcon } from '@/features/task-plugins/components/plugin-icon'
import type { PluginIconInput } from '@/features/task-plugins/lib/plugin-icon'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import { getTaskPluginOptions } from '../api'
import { CHANNEL_TYPE_OPTIONS, CHANNEL_TYPE_TASK_PLUGIN } from '../constants'
import { getChannelTypeIcon } from '../lib/channel-utils'

export function ChannelTypeLogo(props: {
  type: number
  plugin?: PluginIconInput
  size?: number
  className?: string
}) {
  const size = props.size ?? 16
  if (props.type === CHANNEL_TYPE_TASK_PLUGIN && props.plugin) {
    return <PluginIcon plugin={props.plugin} size={size} />
  }
  const isKnownType = CHANNEL_TYPE_OPTIONS.some(
    (option) => option.value === props.type
  )
  if (props.type === CHANNEL_TYPE_TASK_PLUGIN || !isKnownType) {
    const Icon = props.type === CHANNEL_TYPE_TASK_PLUGIN ? Puzzle : Server
    return (
      <Icon
        className={cn('text-muted-foreground shrink-0', props.className)}
        size={size}
        aria-hidden='true'
      />
    )
  }
  return (
    <span className={cn('inline-flex shrink-0', props.className)}>
      {getLobeIcon(`${getChannelTypeIcon(props.type)}.Color`, size)}
    </span>
  )
}

export function TaskPluginChannelBadge(props: { pluginKey?: string }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.auth.user)
  const canBind = hasPermission(
    user,
    ADMIN_PERMISSION_RESOURCES.TASK_PLUGIN,
    ADMIN_PERMISSION_ACTIONS.BIND
  )
  const query = useQuery({
    queryKey: ['task-plugin-options'],
    queryFn: async () => requireServerSuccess(await getTaskPluginOptions()),
    enabled: Boolean(props.pluginKey) && canBind,
    staleTime: 60 * 1000,
  })
  const plugin = query.data?.find((item) => item.key === props.pluginKey)
  const label = plugin?.name || props.pluginKey || t('Task Plugin')
  const iconInput =
    plugin ?? (props.pluginKey ? { key: props.pluginKey } : undefined)

  return (
    <div
      className='flex max-w-full min-w-0 items-center gap-1.5'
      title={
        props.pluginKey
          ? `${t('Task Plugin')} · ${label} (${props.pluginKey})`
          : label
      }
    >
      <ProviderBadge
        iconNode={
          <ChannelTypeLogo
            type={CHANNEL_TYPE_TASK_PLUGIN}
            plugin={iconInput}
            size={18}
          />
        }
        label={label}
        colorText={false}
        copyable={false}
        showDot={false}
        className='min-w-0 overflow-hidden'
      />
      {props.pluginKey && (
        <StatusBadge
          label={t('Task Plugin')}
          variant='neutral'
          size='sm'
          copyable={false}
          showDot={false}
          className='shrink-0 text-[10px]'
        />
      )}
    </div>
  )
}
