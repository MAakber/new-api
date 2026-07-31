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
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import { getUpstreamChannels } from '../api'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import type { UpstreamInterceptionConfig } from '../types'

const errorCodePattern = /^[A-Za-z0-9_.:-]+$/

const defaultConfig: UpstreamInterceptionConfig = {
  enabled: false,
  action: 'remove',
  retry_on_block: false,
  error_status: 502,
  error_code: 'upstream_response_intercepted',
  error_message: '上游响应被内容策略拦截',
  excluded_channel_ids: [],
  rules: [],
}

const schema = z.object({
  enabled: z.boolean(),
  action: z.enum(['remove', 'block']),
  retry_on_block: z.boolean(),
  error_status: z.number().int().min(400).max(599),
  error_code: z.string().trim().min(1).max(64).regex(errorCodePattern),
  error_message: z.string().trim().min(1).max(500),
  excluded_channel_ids: z.array(z.number().int().positive()),
  rules: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(64),
        type: z.enum(['keyword', 'regex']),
        expression: z.string().trim().min(1).max(512),
        enabled: z.boolean(),
      })
    )
    .max(100),
})

type FormValues = z.infer<typeof schema>

type UpstreamInterceptionSectionProps = {
  defaultValues: {
    UpstreamInterceptionConfig: string
  }
}

function parseConfig(value: string): UpstreamInterceptionConfig {
  try {
    const parsed = JSON.parse(value) as Partial<UpstreamInterceptionConfig>
    return {
      ...defaultConfig,
      ...parsed,
      excluded_channel_ids: Array.isArray(parsed.excluded_channel_ids)
        ? parsed.excluded_channel_ids
        : [],
      rules: Array.isArray(parsed.rules) ? parsed.rules : [],
    }
  } catch {
    return structuredClone(defaultConfig)
  }
}

export function UpstreamInterceptionSection(
  props: UpstreamInterceptionSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [channelSearch, setChannelSearch] = useState('')
  const parsedDefaults = useMemo(
    () => parseConfig(props.defaultValues.UpstreamInterceptionConfig),
    [props.defaultValues.UpstreamInterceptionConfig]
  )
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: parsedDefaults,
  })
  const rules = useFieldArray({ control: form.control, name: 'rules' })
  const channelsQuery = useQuery({
    queryKey: ['upstream-channels'],
    queryFn: getUpstreamChannels,
  })
  const channels = useMemo(
    () =>
      (channelsQuery.data?.data ?? [])
        .filter((channel) => channel.id > 0)
        .sort((left, right) => left.id - right.id),
    [channelsQuery.data?.data]
  )
  const filteredChannels = useMemo(() => {
    const query = channelSearch.trim().toLocaleLowerCase()
    if (!query) return channels
    return channels.filter(
      (channel) =>
        channel.name.toLocaleLowerCase().includes(query) ||
        String(channel.id).includes(query)
    )
  }, [channelSearch, channels])

  useEffect(() => {
    form.reset(parsedDefaults)
  }, [form, parsedDefaults])

  const onSubmit = async (values: FormValues) => {
    const normalized: UpstreamInterceptionConfig = {
      ...values,
      error_code: values.error_code.trim(),
      error_message: values.error_message.trim(),
      excluded_channel_ids: [...new Set(values.excluded_channel_ids)].sort(
        (left, right) => left - right
      ),
      rules: values.rules.map((rule) => ({
        ...rule,
        name: rule.name.trim(),
        expression: rule.expression.trim(),
      })),
    }
    await updateOption.mutateAsync({
      key: 'UpstreamInterceptionConfig',
      value: JSON.stringify(normalized),
    })
  }

  return (
    <SettingsSection title={t('Upstream Interception')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save upstream interception'
          />

          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable upstream interception')}</FormLabel>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='action'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Match action')}</FormLabel>
                <ToggleGroup
                  value={[field.value]}
                  onValueChange={(values) => {
                    const next = values.find((value) => value !== field.value)
                    if (next === 'remove' || next === 'block') {
                      field.onChange(next)
                    }
                  }}
                  variant='outline'
                  spacing={0}
                  className='w-full sm:w-fit'
                >
                  <ToggleGroupItem
                    value='remove'
                    className='flex-1 sm:flex-none'
                  >
                    {t('Remove matches')}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value='block'
                    className='flex-1 sm:flex-none'
                  >
                    {t('Block response')}
                  </ToggleGroupItem>
                </ToggleGroup>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='retry_on_block'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>
                    {t('Retry another channel before output')}
                  </FormLabel>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <div className='grid gap-4 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,2fr)]'>
            <FormField
              control={form.control}
              name='error_status'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('HTTP status')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={400}
                      max={599}
                      value={field.value}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='error_code'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Error code')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='error_message'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Error message')}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className='space-y-3'>
            <div className='flex items-center justify-between gap-3'>
              <FormLabel>{t('Interception rules')}</FormLabel>
              <Button
                type='button'
                size='sm'
                variant='outline'
                onClick={() =>
                  rules.append({
                    name: '',
                    type: 'keyword',
                    expression: '',
                    enabled: true,
                  })
                }
                disabled={rules.fields.length >= 100}
              >
                <Plus className='size-4' />
                {t('Add rule')}
              </Button>
            </div>

            {rules.fields.length === 0 ? (
              <div className='border-border text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center text-sm'>
                {t('No interception rules configured')}
              </div>
            ) : (
              <div className='space-y-2'>
                {rules.fields.map((rule, index) => (
                  <div
                    key={rule.id}
                    className='border-border grid items-start gap-3 rounded-md border p-3 md:grid-cols-[auto_minmax(140px,0.8fr)_140px_minmax(220px,2fr)_auto]'
                  >
                    <FormField
                      control={form.control}
                      name={`rules.${index}.enabled`}
                      render={({ field }) => (
                        <FormItem className='pt-2'>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              aria-label={t('Enable rule')}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='md:sr-only'>
                            {t('Rule name')}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder={t('Rule name')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='md:sr-only'>
                            {t('Match type')}
                          </FormLabel>
                          <Select
                            items={[
                              { value: 'keyword', label: t('Keyword') },
                              {
                                value: 'regex',
                                label: t('Regular expression'),
                              },
                            ]}
                            value={field.value}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger className='w-full'>
                                <SelectValue>
                                  {t(
                                    field.value === 'keyword'
                                      ? 'Keyword'
                                      : 'Regular expression'
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectGroup>
                                <SelectItem value='keyword'>
                                  {t('Keyword')}
                                </SelectItem>
                                <SelectItem value='regex'>
                                  {t('Regular expression')}
                                </SelectItem>
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rules.${index}.expression`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className='md:sr-only'>
                            {t('Expression')}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder='通知群\s*\d+' {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      onClick={() => rules.remove(index)}
                      aria-label={t('Delete rule')}
                      title={t('Delete rule')}
                    >
                      <Trash2 className='size-4' />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <FormField
            control={form.control}
            name='excluded_channel_ids'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Excluded channels')}</FormLabel>
                <Input
                  value={channelSearch}
                  onChange={(event) => setChannelSearch(event.target.value)}
                  placeholder={t('Search channels')}
                  className='mb-2'
                />
                <ScrollArea className='border-border h-48 rounded-md border'>
                  <div className='space-y-1 p-2'>
                    {filteredChannels.length === 0 ? (
                      <div className='text-muted-foreground px-2 py-6 text-center text-sm'>
                        {t('No channels found')}
                      </div>
                    ) : (
                      filteredChannels.map((channel) => {
                        const checked = field.value.includes(channel.id)
                        return (
                          <label
                            key={channel.id}
                            className='hover:bg-muted flex min-h-9 cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm'
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                field.onChange(
                                  nextChecked
                                    ? [...field.value, channel.id]
                                    : field.value.filter(
                                        (id) => id !== channel.id
                                      )
                                )
                              }}
                            />
                            <span className='min-w-0 flex-1 truncate'>
                              {channel.name}
                            </span>
                            <span className='text-muted-foreground tabular-nums'>
                              #{channel.id}
                            </span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
