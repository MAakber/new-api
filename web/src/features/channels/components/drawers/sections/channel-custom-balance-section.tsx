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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatTimestampToDate } from '@/lib/format'

import {
  checkinCustomBalance,
  getCustomBalanceConfig,
  refreshCustomBalance,
  updateCustomBalanceConfig,
} from '../../../api'
import {
  buildCustomBalancePayload,
  createCustomBalanceFormValues,
  CUSTOM_BALANCE_DEFAULT_VALUES,
  CUSTOM_BALANCE_PROVIDERS,
  customBalanceQueryKey,
  customBalanceFormSchema,
  getCustomBalanceStatusVariant,
  normalizeCustomBalanceSettings,
  type CustomBalanceFormValues,
} from '../../../lib'
import type { CustomBalanceSettings } from '../../../types'

type ChannelCustomBalanceSectionProps = {
  channelId?: number | null
  disabled: boolean
  onConfiguredChange?: (configured: boolean) => void
  onDirtyChange?: (dirty: boolean) => void
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const response = (error as { response?: unknown }).response
    if (typeof response === 'object' && response !== null) {
      const data = (response as { data?: unknown }).data
      if (typeof data === 'object' && data !== null) {
        const message = (data as { message?: unknown }).message
        if (typeof message === 'string' && message) return message
      }
    }
  }

  if (error instanceof Error && error.message) return error.message

  return fallback
}

function requireSuccessfulResponse(
  response: { success: boolean; message?: string },
  fallback: string
) {
  if (!response.success) {
    throw new Error(response.message || fallback)
  }
  return response
}

function numberInputValue(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function StatusItem(props: {
  label: string
  status?: string | null
  timestamp?: number | null
  error?: string | null
}) {
  const { t } = useTranslation()
  const status = props.status?.trim() || null

  return (
    <div className='bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 text-xs'>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground'>{props.label}</span>
        <Badge variant={getCustomBalanceStatusVariant(status)}>
          {status || t('Not available')}
        </Badge>
      </div>
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground'>{t('Last run')}</span>
        <span>{formatTimestampToDate(props.timestamp ?? undefined)}</span>
      </div>
      {props.error && (
        <p className='text-destructive break-words'>{props.error}</p>
      )}
    </div>
  )
}

function ScheduleItem(props: { label: string; timestamp?: number | null }) {
  return (
    <div className='flex items-center justify-between gap-3 text-xs'>
      <span className='text-muted-foreground'>{props.label}</span>
      <span>{formatTimestampToDate(props.timestamp ?? undefined)}</span>
    </div>
  )
}

export function ChannelCustomBalanceSection(
  props: ChannelCustomBalanceSectionProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channelId = props.channelId ?? null
  const configQuery = useQuery({
    queryKey:
      channelId !== null
        ? customBalanceQueryKey(channelId)
        : ['channels', 0, 'custom-balance'],
    enabled: channelId !== null,
    queryFn: async () => {
      const response = await getCustomBalanceConfig(channelId as number)
      requireSuccessfulResponse(
        response,
        t('Failed to load custom balance settings')
      )
      return normalizeCustomBalanceSettings(response.data)
    },
  })
  const form = useForm<CustomBalanceFormValues>({
    resolver: zodResolver(customBalanceFormSchema),
    defaultValues: CUSTOM_BALANCE_DEFAULT_VALUES,
  })
  const enabled = form.watch('enabled')
  const provider = form.watch('provider')
  const useChannelKey = form.watch('use_channel_key')
  const onConfiguredChange = props.onConfiguredChange
  const onDirtyChange = props.onDirtyChange

  useEffect(() => {
    onConfiguredChange?.(enabled)
  }, [enabled, onConfiguredChange])

  useEffect(() => {
    onDirtyChange?.(form.formState.isDirty)
  }, [form.formState.isDirty, onDirtyChange])

  useEffect(() => {
    if (provider === 'new_api' && useChannelKey) {
      form.setValue('use_channel_key', false, { shouldDirty: false })
    }
  }, [form, provider, useChannelKey])

  useEffect(() => {
    if (configQuery.data && !form.formState.isDirty) {
      form.reset(createCustomBalanceFormValues(configQuery.data))
    }
  }, [configQuery.data, form, form.formState.isDirty])

  const [operationError, setOperationError] = useState<string | null>(null)
  const saveMutation = useMutation({
    mutationFn: async (values: CustomBalanceFormValues) => {
      const response = await updateCustomBalanceConfig(
        channelId as number,
        buildCustomBalancePayload(values)
      )
      return requireSuccessfulResponse(
        response,
        t('Failed to save custom balance settings')
      )
    },
    onSuccess: (_, values) => {
      setOperationError(null)
      form.reset({ ...values, credential: '' })
      void queryClient.invalidateQueries({
        queryKey: customBalanceQueryKey(channelId as number),
      })
      toast.success(t('Custom balance settings saved'))
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        t('Failed to save custom balance settings')
      )
      setOperationError(message)
      toast.error(message)
    },
  })
  const balanceMutation = useMutation({
    mutationFn: async () => {
      const response = await refreshCustomBalance(channelId as number)
      return requireSuccessfulResponse(
        response,
        t('Failed to refresh custom balance')
      )
    },
    onSuccess: () => {
      setOperationError(null)
      void queryClient.invalidateQueries({
        queryKey: customBalanceQueryKey(channelId as number),
      })
      toast.success(t('Custom balance refresh started'))
    },
    onError: (error) => {
      const message = getErrorMessage(
        error,
        t('Failed to refresh custom balance')
      )
      setOperationError(message)
      toast.error(message)
    },
  })
  const checkinMutation = useMutation({
    mutationFn: async () => {
      const response = await checkinCustomBalance(channelId as number)
      return requireSuccessfulResponse(response, t('Failed to run check-in'))
    },
    onSuccess: () => {
      setOperationError(null)
      void queryClient.invalidateQueries({
        queryKey: customBalanceQueryKey(channelId as number),
      })
      toast.success(t('Custom check-in started'))
    },
    onError: (error) => {
      const message = getErrorMessage(error, t('Failed to run check-in'))
      setOperationError(message)
      toast.error(message)
    },
  })

  const config: CustomBalanceSettings | undefined = configQuery.data
  const providerLabels: Record<string, string> = {
    new_api: t('New API compatible'),
    one_api: t('One API'),
    veloera: t('Veloera'),
    anyrouter: t('AnyRouter'),
  }
  const authType = form.watch('auth_type')
  const isMutating =
    saveMutation.isPending ||
    balanceMutation.isPending ||
    checkinMutation.isPending
  const controlsDisabled = props.disabled || isMutating

  if (channelId === null) {
    return (
      <div className='flex flex-col gap-4'>
        <SectionHeading />
        <Alert>
          <AlertDescription>
            {t('Save the channel before configuring custom balance settings.')}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleSave = (values: CustomBalanceFormValues) => {
    setOperationError(null)
    saveMutation.mutate(values)
  }

  return (
    <div className='flex flex-col gap-4'>
      <SectionHeading />

      {configQuery.isPending && (
        <div className='space-y-3'>
          <Skeleton className='h-12 w-full' />
          <Skeleton className='h-24 w-full' />
        </div>
      )}

      {configQuery.isError && (
        <Alert variant='destructive'>
          <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <span>
              {getErrorMessage(
                configQuery.error,
                t('Failed to load custom balance settings')
              )}
            </span>
            <Button
              type='button'
              size='sm'
              variant='outline'
              onClick={() => void configQuery.refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {config && (
        <>
          <div className='bg-muted/30 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>{t('Provider')}</span>
              <span>{providerLabels[config.provider] || config.provider}</span>
            </div>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground'>{t('Credential')}</span>
              <Badge variant={config.credential_set ? 'secondary' : 'outline'}>
                {config.credential_set
                  ? t('Credential set')
                  : t('Credential not set')}
              </Badge>
            </div>
          </div>

          {operationError && (
            <Alert variant='destructive'>
              <AlertDescription>{operationError}</AlertDescription>
            </Alert>
          )}

          <Form {...form}>
            <div className='flex flex-col gap-4'>
              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                    <div className='space-y-0.5'>
                      <FormLabel>{t('Enable custom balance')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Use this channel to query balance and run scheduled check-ins.'
                        )}
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={controlsDisabled}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='provider'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Provider')}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={controlsDisabled}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CUSTOM_BALANCE_PROVIDERS.map((provider) => (
                            <SelectItem key={provider} value={provider}>
                              {providerLabels[provider]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='auth_type'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Authentication type')}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={controlsDisabled}
                      >
                        <FormControl>
                          <SelectTrigger className='w-full'>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value='token'>{t('Token')}</SelectItem>
                          <SelectItem value='cookie'>{t('Cookie')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {provider !== 'new_api' && (
                <FormField
                  control={form.control}
                  name='use_channel_key'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between rounded-lg border p-3'>
                      <div className='space-y-0.5'>
                        <FormLabel>{t('Use channel key')}</FormLabel>
                        <FormDescription>
                          {t(
                            'Reuse this channel key instead of storing an independent credential.'
                          )}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name='credential'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {authType === 'cookie' ? t('Cookie') : t('Token')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        type='password'
                        autoComplete='new-password'
                        placeholder={
                          useChannelKey
                            ? t('Channel key is used for authentication')
                            : t('Leave empty to keep the existing credential')
                        }
                        {...field}
                        disabled={controlsDisabled || useChannelKey}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'The credential is write-only and will never be shown again.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='user_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('User ID')}</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={controlsDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name='quota_per_unit'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Quota per unit')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step='any'
                          {...field}
                          onChange={(event) =>
                            field.onChange(numberInputValue(event.target.value))
                          }
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'Convert the provider balance unit into quota units.'
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid gap-3 rounded-lg border p-3 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='auto_balance'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between gap-3'>
                      <FormLabel>{t('Automatic balance refresh')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='auto_checkin'
                  render={({ field }) => (
                    <FormItem className='flex flex-row items-center justify-between gap-3'>
                      <FormLabel>{t('Automatic check-in')}</FormLabel>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='balance_interval_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Balance interval (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...field}
                          onChange={(event) =>
                            field.onChange(numberInputValue(event.target.value))
                          }
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='checkin_interval_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Check-in interval (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...field}
                          onChange={(event) =>
                            field.onChange(numberInputValue(event.target.value))
                          }
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                <FormField
                  control={form.control}
                  name='retry_max_attempts'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Maximum retry attempts')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...field}
                          onChange={(event) =>
                            field.onChange(numberInputValue(event.target.value))
                          }
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='retry_interval_seconds'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Retry interval (seconds)')}</FormLabel>
                      <FormControl>
                        <Input
                          type='number'
                          min={1}
                          step={1}
                          {...field}
                          onChange={(event) =>
                            field.onChange(numberInputValue(event.target.value))
                          }
                          disabled={controlsDisabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className='bg-muted/20 flex flex-col gap-2 rounded-lg border p-3'>
                <div className='flex items-center gap-2'>
                  <CalendarClock className='text-muted-foreground size-4' />
                  <span className='text-sm font-medium'>
                    {t('Schedule status')}
                  </span>
                </div>
                <ScheduleItem
                  label={t('Next balance refresh')}
                  timestamp={config.next_balance_at}
                />
                <ScheduleItem
                  label={t('Next check-in')}
                  timestamp={config.next_checkin_at}
                />
              </div>

              <div className='grid gap-3 sm:grid-cols-2'>
                <StatusItem
                  label={t('Balance status')}
                  status={config.last_balance_status}
                  timestamp={config.last_balance_at}
                  error={config.last_balance_error}
                />
                <StatusItem
                  label={t('Check-in status')}
                  status={config.last_checkin_status}
                  timestamp={config.last_checkin_at}
                  error={config.last_checkin_error}
                />
              </div>

              <div className='flex flex-wrap items-center justify-between gap-2 border-t pt-3'>
                <Button
                  type='button'
                  variant='outline'
                  disabled={controlsDisabled || !form.formState.isDirty}
                  onClick={() => void form.handleSubmit(handleSave)()}
                >
                  {saveMutation.isPending && (
                    <Loader2 className='animate-spin' aria-hidden='true' />
                  )}
                  {t('Save custom balance settings')}
                </Button>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={controlsDisabled}
                    onClick={() => {
                      setOperationError(null)
                      balanceMutation.mutate()
                    }}
                  >
                    {balanceMutation.isPending ? (
                      <Loader2 className='animate-spin' aria-hidden='true' />
                    ) : (
                      <RefreshCw aria-hidden='true' />
                    )}
                    {t('Refresh balance now')}
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    disabled={controlsDisabled}
                    onClick={() => {
                      setOperationError(null)
                      checkinMutation.mutate()
                    }}
                  >
                    {checkinMutation.isPending ? (
                      <Loader2 className='animate-spin' aria-hidden='true' />
                    ) : (
                      <CheckCircle2 aria-hidden='true' />
                    )}
                    {t('Check in now')}
                  </Button>
                </div>
              </div>
            </div>
          </Form>
        </>
      )}
    </div>
  )
}

function SectionHeading() {
  const { t } = useTranslation()

  return (
    <div className='flex items-start gap-3'>
      <IconBadge tone='success' size='md'>
        <BadgeDollarSign className='size-4' aria-hidden='true' />
      </IconBadge>
      <div className='space-y-1'>
        <h3 className='text-sm font-semibold'>
          {t('Custom Balance & Check-in')}
        </h3>
        <p className='text-muted-foreground text-xs'>
          {t(
            'Configure channel-level balance refresh, automatic check-in, and retry behavior.'
          )}
        </p>
      </div>
    </div>
  )
}
