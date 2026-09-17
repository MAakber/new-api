import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import { updateChannel } from '../../api'
import {
  useFetchModels,
  type FetchModelsTab,
} from '../../hooks/use-fetch-models'
import { channelsQueryKeys } from '../../lib/channel-actions'
import type { Channel } from '../../types'
import { useChannels } from '../channels-provider'
import { resolveFetchModelsChannel } from './fetch-models-channel'
import { FetchModelsFilters } from './fetch-models-filters'
import { FetchModelsGroup } from './fetch-models-group'

type FetchModelsDialogBaseProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  redirectModels?: string[]
  redirectSourceModels?: string[]
  customFetcher?: () => Promise<string[]>
  channelName?: string | null
  channel?: Channel | null
}

type FetchModelsDialogProps = FetchModelsDialogBaseProps &
  (
    | {
        onModelsSelected: (models: string[]) => void
        existingModelsOverride: string[]
      }
    | {
        onModelsSelected?: undefined
        existingModelsOverride?: undefined
      }
  )

export function FetchModelsDialog(props: FetchModelsDialogProps) {
  const { currentRow } = useChannels()
  const activeChannel = props.customFetcher
    ? null
    : resolveFetchModelsChannel(props.channel, currentRow)

  if (!props.open) return null

  return (
    <FetchModelsSession
      {...props}
      key={
        props.customFetcher
          ? `custom-${props.channel?.id ?? 'new'}`
          : (activeChannel?.id ?? 'none')
      }
      activeChannel={activeChannel}
    />
  )
}

function FetchModelsSession(
  props: FetchModelsDialogProps & { activeChannel: Channel | null }
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const state = useFetchModels({
    channel: props.activeChannel,
    customFetcher: props.customFetcher,
    existingModelsOverride: props.existingModelsOverride,
    redirectModels: props.redirectModels,
    redirectSourceModels: props.redirectSourceModels,
  })
  const save = useMutation({
    mutationFn: async (models: string[]) => {
      if (!props.activeChannel) throw new Error(t('No channel selected'))
      return updateChannel(props.activeChannel.id, { models: models.join(',') })
    },
  })

  async function handleSave() {
    if (props.onModelsSelected) {
      props.onModelsSelected([...state.selectedModels])
      toast.success(t('Models filled to form'))
      props.onOpenChange(false)
      return
    }
    if (!props.activeChannel) return

    try {
      const response = await save.mutateAsync(state.selectedModels)
      if (response.success) {
        void queryClient.invalidateQueries({
          queryKey: channelsQueryKeys.lists(),
        })
      }
      if (!mounted.current) return
      if (!response.success) {
        handleServerError(response, t('Failed to update models'))
        return
      }
      toast.success(t('Models updated successfully'))
      props.onOpenChange(false)
    } catch (error: unknown) {
      if (!mounted.current) return
      handleServerError(error, t('Failed to update models'))
    }
  }

  const channelName = props.activeChannel?.name || props.channelName
  const hasSource = !!(props.activeChannel || props.customFetcher)
  const tabs: { value: FetchModelsTab; label: string }[] = [
    {
      value: 'new',
      label: t('New Models ({{count}})', { count: state.tabCounts.new }),
    },
    {
      value: 'existing',
      label: t('Existing Models ({{count}})', {
        count: state.tabCounts.existing,
      }),
    },
  ]
  if (state.hasRemovedModels) {
    tabs.push({
      value: 'removed',
      label: t('Removed Models ({{count}})', {
        count: state.tabCounts.removed,
      }),
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !save.isPending) props.onOpenChange(false)
      }}
    >
      <DialogContent className='flex h-[min(46rem,90dvh)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 max-md:inset-0 max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:!w-screen max-md:!max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:!rounded-none sm:max-w-3xl'>
        <DialogHeader className='shrink-0 gap-1.5 px-5 pt-5 pr-12 pb-4 max-md:px-4 max-md:pt-4 max-md:pr-12'>
          <DialogTitle>{t('Fetch Models')}</DialogTitle>
          <DialogDescription className='break-words'>
            {channelName ? (
              <>
                {t('Channel:')} <strong>{channelName}</strong>
              </>
            ) : (
              t('Fetch available models from upstream')
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 md:px-4'>
          {!hasSource && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('No channel selected')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {hasSource && state.query.isPending && (
            <div
              role='status'
              aria-label={t('Fetching models...')}
              className='text-muted-foreground flex flex-1 items-center justify-center gap-2'
            >
              <Spinner />
              {t('Fetching models...')}
            </div>
          )}
          {hasSource && state.query.isError && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('Failed to fetch models')}</EmptyTitle>
                <EmptyDescription className='break-all'>
                  {state.query.error.message}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant='outline'
                  onClick={() => void state.query.refetch()}
                  disabled={state.query.isFetching}
                >
                  {state.query.isFetching && (
                    <Spinner data-icon='inline-start' />
                  )}
                  {t('Retry')}
                </Button>
              </EmptyContent>
            </Empty>
          )}
          {hasSource && state.query.isSuccess && (
            <div className='flex min-h-0 min-w-0 flex-1 flex-col gap-3'>
              <FetchModelsFilters
                types={state.selectedTypes}
                counts={state.typeCounts}
                onTypesChange={state.changeTypes}
                search={state.searchKeyword}
                onSearchChange={state.setSearchKeyword}
                onClear={state.clearFilters}
              />
              <Tabs
                value={state.tab}
                onValueChange={(value) => state.setTab(value as FetchModelsTab)}
                className='flex min-h-0 min-w-0 flex-1 flex-col gap-3'
              >
                <TabsList
                  className={cn(
                    'mx-1 grid h-auto w-auto shrink-0',
                    state.hasRemovedModels ? 'grid-cols-3' : 'grid-cols-2'
                  )}
                >
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className='min-w-0 whitespace-normal max-md:text-xs'
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((tab) => (
                  <TabsContent
                    key={tab.value}
                    value={tab.value}
                    className='min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-1 pb-1'
                  >
                    {tab.value === state.tab && (
                      <div className='flex min-w-0 flex-col gap-2'>
                        {tab.value === 'removed' && (
                          <p className='text-muted-foreground px-1 text-xs leading-relaxed'>
                            {t(
                              'These models were not returned by the upstream. Model redirect aliases are excluded. Adjust your selection before saving.'
                            )}
                          </p>
                        )}
                        {state.groups.map((group) => (
                          <FetchModelsGroup
                            key={group.provider?.id ?? 'other'}
                            group={group}
                            selected={state.selectedSet}
                            onToggle={state.toggleModels}
                            disabled={save.isPending}
                          />
                        ))}
                        {state.groups.length === 0 && (
                          <Empty className='min-h-48'>
                            <EmptyHeader>
                              <EmptyTitle>
                                {state.hasModels
                                  ? t('No models match these filters.')
                                  : t('No models fetched yet.')}
                              </EmptyTitle>
                            </EmptyHeader>
                            <EmptyContent>
                              {(state.selectedTypes.length > 0 ||
                                state.searchKeyword) && (
                                <Button
                                  variant='outline'
                                  onClick={state.clearFilters}
                                >
                                  {t('Clear filters')}
                                </Button>
                              )}
                              {!state.hasModels && (
                                <Button
                                  variant='outline'
                                  onClick={() => void state.query.refetch()}
                                  disabled={state.query.isFetching}
                                >
                                  {state.query.isFetching && (
                                    <Spinner data-icon='inline-start' />
                                  )}
                                  {t('Fetch Models')}
                                </Button>
                              )}
                            </EmptyContent>
                          </Empty>
                        )}
                      </div>
                    )}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
        </div>

        <DialogFooter className='m-0 shrink-0 flex-col gap-3 rounded-none px-4 py-3 max-md:pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] md:flex-row md:items-center md:px-5'>
          <span
            role='status'
            className='text-muted-foreground min-w-0 flex-1 text-sm break-words tabular-nums'
          >
            {t('{{n}} model(s) selected', { n: state.selectedModels.length })}
          </span>
          <div className='grid grid-cols-2 gap-2 md:flex'>
            <Button
              variant='outline'
              onClick={() => props.onOpenChange(false)}
              disabled={save.isPending}
            >
              {t('Cancel')}
            </Button>
            <Button
              onClick={() => void handleSave()}
              disabled={
                save.isPending ||
                !state.query.isSuccess ||
                !state.hasModels ||
                !(props.onModelsSelected || props.activeChannel)
              }
            >
              {save.isPending && <Spinner data-icon='inline-start' />}
              {save.isPending ? t('Saving...') : t('Save Models')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
