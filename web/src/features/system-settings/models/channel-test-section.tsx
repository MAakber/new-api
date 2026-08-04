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
import { useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import {
  Form,
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const channelTestModes = ['scheduled_all', 'passive_recovery'] as const
type ChannelTestMode = (typeof channelTestModes)[number]

const channelTestSchema = z.object({
  AutomaticEnableChannelEnabled: z.boolean(),
  monitor_setting: z.object({
    channel_test_message: z
      .string()
      .max(4096, 'Test message must not exceed 4096 characters'),
    channel_test_use_channel_style: z.boolean(),
    channel_test_show_response_preview: z.boolean(),
    auto_test_channel_enabled: z.boolean(),
    auto_test_channel_minutes: z.coerce
      .number()
      .int()
      .min(1, 'Interval must be at least 1 minute'),
    channel_test_mode: z.enum(channelTestModes),
  }),
})

type ChannelTestFormInput = z.input<typeof channelTestSchema>
type ChannelTestFormValues = z.output<typeof channelTestSchema>

type ChannelTestSectionProps = {
  defaultValues: {
    AutomaticEnableChannelEnabled: boolean
    'monitor_setting.channel_test_message': string
    'monitor_setting.channel_test_use_channel_style': boolean
    'monitor_setting.channel_test_show_response_preview': boolean
    'monitor_setting.auto_test_channel_enabled': boolean
    'monitor_setting.auto_test_channel_minutes': number
    'monitor_setting.channel_test_mode': ChannelTestMode
  }
}

type FlatChannelTestDefaults = ChannelTestSectionProps['defaultValues']

function normalizeChannelTestMode(value?: string): ChannelTestMode {
  return value === 'passive_recovery' ? 'passive_recovery' : 'scheduled_all'
}

const buildFormDefaults = (
  defaults: FlatChannelTestDefaults
): ChannelTestFormInput => ({
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  monitor_setting: {
    channel_test_message:
      defaults['monitor_setting.channel_test_message'] ?? 'hi',
    channel_test_use_channel_style:
      defaults['monitor_setting.channel_test_use_channel_style'] ?? true,
    channel_test_show_response_preview:
      defaults['monitor_setting.channel_test_show_response_preview'] ?? false,
    auto_test_channel_enabled:
      defaults['monitor_setting.auto_test_channel_enabled'],
    auto_test_channel_minutes:
      defaults['monitor_setting.auto_test_channel_minutes'],
    channel_test_mode: normalizeChannelTestMode(
      defaults['monitor_setting.channel_test_mode']
    ),
  },
})

const normalizeDefaults = (
  defaults: FlatChannelTestDefaults
): FlatChannelTestDefaults => ({
  AutomaticEnableChannelEnabled: defaults.AutomaticEnableChannelEnabled,
  'monitor_setting.channel_test_message':
    defaults['monitor_setting.channel_test_message'] ?? 'hi',
  'monitor_setting.channel_test_use_channel_style':
    defaults['monitor_setting.channel_test_use_channel_style'] ?? true,
  'monitor_setting.channel_test_show_response_preview':
    defaults['monitor_setting.channel_test_show_response_preview'] ?? false,
  'monitor_setting.auto_test_channel_enabled':
    defaults['monitor_setting.auto_test_channel_enabled'],
  'monitor_setting.auto_test_channel_minutes':
    defaults['monitor_setting.auto_test_channel_minutes'],
  'monitor_setting.channel_test_mode': normalizeChannelTestMode(
    defaults['monitor_setting.channel_test_mode']
  ),
})

const normalizeFormValues = (
  values: ChannelTestFormValues
): FlatChannelTestDefaults => ({
  AutomaticEnableChannelEnabled: values.AutomaticEnableChannelEnabled,
  'monitor_setting.channel_test_message':
    values.monitor_setting.channel_test_message.trim() || 'hi',
  'monitor_setting.channel_test_use_channel_style':
    values.monitor_setting.channel_test_use_channel_style,
  'monitor_setting.channel_test_show_response_preview':
    values.monitor_setting.channel_test_show_response_preview,
  'monitor_setting.auto_test_channel_enabled':
    values.monitor_setting.auto_test_channel_enabled,
  'monitor_setting.auto_test_channel_minutes':
    values.monitor_setting.auto_test_channel_minutes,
  'monitor_setting.channel_test_mode': values.monitor_setting.channel_test_mode,
})

export function ChannelTestSection(props: ChannelTestSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const baselineRef = useRef<FlatChannelTestDefaults>(
    normalizeDefaults(props.defaultValues)
  )
  const baselineSerializedRef = useRef<string>(
    JSON.stringify(normalizeDefaults(props.defaultValues))
  )

  const formDefaults = useMemo(
    () => buildFormDefaults(props.defaultValues),
    [props.defaultValues]
  )

  const form = useForm<ChannelTestFormInput, unknown, ChannelTestFormValues>({
    resolver: zodResolver(channelTestSchema),
    defaultValues: formDefaults,
  })

  useResetForm(form, formDefaults)

  useEffect(() => {
    const normalized = normalizeDefaults(props.defaultValues)
    const serialized = JSON.stringify(normalized)
    if (serialized === baselineSerializedRef.current) return

    baselineRef.current = normalized
    baselineSerializedRef.current = serialized
  }, [props.defaultValues])

  const channelTestMode = form.watch('monitor_setting.channel_test_mode')

  const onSubmit = async (values: ChannelTestFormValues) => {
    const normalized = normalizeFormValues(values)
    const updates = (
      Object.keys(normalized) as Array<keyof FlatChannelTestDefaults>
    ).filter((key) => normalized[key] !== baselineRef.current[key])

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const key of updates) {
      await updateOption.mutateAsync({
        key,
        value: normalized[key],
      })
    }

    baselineRef.current = normalized
    baselineSerializedRef.current = JSON.stringify(normalized)
  }

  return (
    <SettingsSection title={t('Channel Test')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>{t('Test request')}</h4>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Set the shared request used when the system checks channel connections.'
                )}
              </p>
            </div>

            <FormField
              control={form.control}
              name='monitor_setting.channel_test_message'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Default test message')}</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      {...field}
                      onChange={(event) => field.onChange(event.target.value)}
                    />
                  </FormControl>
                  <FormDescription>
                    {t(
                      'Used for scheduled and detailed channel tests when no temporary message is entered.'
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='grid min-w-0 gap-6 lg:grid-cols-2'>
              <FormField
                control={form.control}
                name='monitor_setting.channel_test_use_channel_style'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Use channel style')}</FormLabel>
                      <FormDescription>
                        {t(
                          "When enabled, tests keep the channel's full specialized client profile. When disabled, tests use only the base protocol, authentication, and request format."
                        )}
                      </FormDescription>
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
                name='monitor_setting.channel_test_show_response_preview'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Show response preview')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Show a small, truncated response preview in detailed test results. Keep this off unless you need to inspect a response.'
                        )}
                      </FormDescription>
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
            </div>
          </div>

          <Separator />

          <div className='flex min-w-0 flex-col gap-4'>
            <div className='flex flex-col gap-1'>
              <h4 className='text-sm font-medium'>
                {t('Channel health checks')}
              </h4>
              <p className='text-muted-foreground text-xs'>
                {t('Set how the system checks channels in the background.')}
              </p>
            </div>

            <div className='grid min-w-0 gap-6 lg:grid-cols-3'>
              <FormField
                control={form.control}
                name='monitor_setting.auto_test_channel_enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Scheduled channel tests')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Automatically probe all channels in the background'
                        )}
                      </FormDescription>
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
                name='monitor_setting.channel_test_mode'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Channel test mode')}</FormLabel>
                    <Select
                      items={[
                        {
                          value: 'scheduled_all',
                          label: t('Scheduled full test'),
                        },
                        {
                          value: 'passive_recovery',
                          label: t('Passive recovery only'),
                        },
                      ]}
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value='scheduled_all'>
                            {t('Scheduled full test')}
                          </SelectItem>
                          <SelectItem value='passive_recovery'>
                            {t('Passive recovery only')}
                          </SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t(
                        'Scheduled full test probes non-manually-disabled channels; passive recovery only checks auto-disabled channels after real request failures.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='monitor_setting.auto_test_channel_minutes'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Test interval (minutes)')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        step={1}
                        {...safeNumberFieldProps(field)}
                      />
                    </FormControl>
                    <FormDescription>
                      {channelTestMode === 'passive_recovery'
                        ? t(
                            'How frequently the system checks auto-disabled channels for recovery'
                          )
                        : t('How frequently the system tests all channels')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='AutomaticEnableChannelEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Re-enable on success')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Bring channels back online after successful checks'
                        )}
                      </FormDescription>
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
            </div>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
