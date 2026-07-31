import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AutoSyncStatusStrip } from '@/components/auto-sync-status-strip'
import { Switch } from '@/components/ui/switch'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { getAutoModelSyncStatus, updateAutoModelSyncConfig } from '../api'

function resultNumber(
  result: Record<string, unknown> | undefined,
  key: string
) {
  const value = result?.[key]
  return typeof value === 'number' ? value : 0
}

export function ModelAutoSyncControl() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const role = useAuthStore((state) => state.auth.user?.role ?? ROLE.GUEST)
  const isAdmin = role >= ROLE.ADMIN
  const isRoot = role === ROLE.SUPER_ADMIN
  const statusQuery = useQuery({
    queryKey: ['auto-model-sync-status'],
    queryFn: getAutoModelSyncStatus,
    enabled: isAdmin,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.status
      return status?.running || status?.pending_events ? 5000 : 30000
    },
  })
  const mutation = useMutation({
    mutationFn: updateAutoModelSyncConfig,
    onSuccess: (response) => {
      queryClient.setQueryData(['auto-model-sync-status'], response)
      toast.success(t('Automatic sync configuration saved'))
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!isAdmin) return null
  const view = statusQuery.data?.data
  const result = view?.status?.latest?.result

  return (
    <div className='flex shrink-0 flex-col gap-2'>
      <div className='flex min-h-8 items-center justify-between gap-3'>
        <span className='text-sm font-medium'>
          {t('Automatic model metadata sync')}
        </span>
        {isRoot ? (
          <Switch
            checked={view?.enabled ?? false}
            onCheckedChange={(checked) => mutation.mutate(checked)}
            disabled={statusQuery.isLoading || mutation.isPending}
            aria-label={t('Automatic model metadata sync')}
          />
        ) : null}
      </div>
      <AutoSyncStatusStrip
        enabled={view?.enabled ?? false}
        status={view?.status}
        summary={[
          {
            label: t('Models created'),
            value: resultNumber(result, 'created_models'),
          },
          {
            label: t('Vendors created'),
            value: resultNumber(result, 'created_vendors'),
          },
        ]}
      />
    </div>
  )
}
