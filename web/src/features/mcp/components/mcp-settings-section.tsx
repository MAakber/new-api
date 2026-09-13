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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon, PlusIcon, ServerIcon, Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/features/system-settings/components/settings-section'

import { deleteMCPServer, getMCPServers, MCP_QUERY_KEYS } from '../api'
import type { MCPServerConfig } from '../types'
import { MCPServerDialog } from './mcp-server-dialog'

const newServer: MCPServerConfig = {
  id: 0,
  name: '',
  url: '',
  enabled: false,
  groups: [],
  tools: [],
  timeout_seconds: 30,
  max_concurrency: 4,
  revision: 0,
  credential_set: false,
}

export function MCPSettingsSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const servers = useQuery({
    queryKey: MCP_QUERY_KEYS.servers,
    queryFn: getMCPServers,
  })
  const [editing, setEditing] = useState<MCPServerConfig | null>(null)
  const [deleting, setDeleting] = useState<MCPServerConfig | null>(null)
  const remove = useMutation({
    mutationFn: deleteMCPServer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp'] })
      setDeleting(null)
      toast.success(t('MCP service deleted'))
    },
  })

  return (
    <SettingsSection title={t('MCP Management')}>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <p className='text-muted-foreground max-w-xl text-sm'>
          {t(
            'Manage shared MCP connections, search tools and access by user group.'
          )}
        </p>
        <Button
          onClick={() => setEditing(newServer)}
          disabled={servers.isPending || (servers.data?.length ?? 0) >= 32}
        >
          <PlusIcon aria-hidden='true' className='size-4' />
          {t('Add MCP service')}
        </Button>
      </div>
      {servers.isPending && <LoadingState />}
      {servers.isError && <ErrorState onRetry={() => void servers.refetch()} />}
      {servers.isSuccess && servers.data.length === 0 && (
        <EmptyState
          icon={ServerIcon}
          title={t('No MCP services configured')}
          description={t(
            'Add a service when ready. Chat without search remains available.'
          )}
        />
      )}
      {servers.data?.map((server) => (
        <div
          key={server.id}
          className='flex flex-wrap items-start gap-3 rounded-xl border p-4'
        >
          <ServerIcon
            aria-hidden='true'
            className='text-muted-foreground mt-1 size-5 shrink-0'
          />
          <div className='min-w-0 flex-1 basis-48 space-y-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='font-medium break-all'>{server.name}</span>
              <Badge variant={server.enabled ? 'default' : 'secondary'}>
                {server.enabled ? t('Enabled') : t('Disabled')}
              </Badge>
            </div>
            <p className='text-muted-foreground text-xs break-all'>
              {server.url}
            </p>
            <p className='text-muted-foreground text-xs break-words'>
              {server.groups.join(', ')} ·{' '}
              {t('{{count}} tools enabled', {
                count: server.tools.filter((tool) => tool.enabled).length,
              })}
            </p>
          </div>
          <div className='flex gap-1'>
            <Button
              variant='ghost'
              size='icon'
              aria-label={`${t('Edit')}: ${server.name}`}
              onClick={() => setEditing(server)}
            >
              <PencilIcon aria-hidden='true' className='size-4' />
            </Button>
            <Button
              variant='ghost'
              size='icon'
              aria-label={`${t('Delete')}: ${server.name}`}
              onClick={() => setDeleting(server)}
            >
              <Trash2Icon aria-hidden='true' className='size-4' />
            </Button>
          </div>
        </div>
      ))}
      {editing && (
        <MCPServerDialog
          key={`${editing.id}:${editing.revision}`}
          server={editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null)
        }}
        destructive
        title={t('Delete MCP service?')}
        desc={t(
          'This connection will no longer be available to conversations.'
        )}
        confirmText={t('Delete')}
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (deleting) remove.mutate(deleting)
        }}
      />
    </SettingsSection>
  )
}
