import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const userAgentRestrictionsSchema = z.object({
  RelayUserAgentBlacklistEnabled: z.boolean(),
  RelayUserAgentBlacklist: z.string(),
})

type UserAgentRestrictionsFormValues = z.infer<
  typeof userAgentRestrictionsSchema
>

type UserAgentRestrictionsSectionProps = {
  defaultValues: UserAgentRestrictionsFormValues
}

const normalizeBlacklist = (value: string) =>
  [
    ...new Set(
      value
        .split('\n')
        .map((pattern) => pattern.trim())
        .filter(Boolean)
    ),
  ].join('\n')

export function UserAgentRestrictionsSection(
  props: UserAgentRestrictionsSectionProps
) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<UserAgentRestrictionsFormValues>({
    resolver: zodResolver(userAgentRestrictionsSchema),
    defaultValues: props.defaultValues,
  })

  useEffect(() => {
    form.reset(props.defaultValues)
  }, [form, props.defaultValues])

  const onSubmit = async (values: UserAgentRestrictionsFormValues) => {
    const blacklist = normalizeBlacklist(values.RelayUserAgentBlacklist)
    if (
      blacklist !==
      normalizeBlacklist(props.defaultValues.RelayUserAgentBlacklist)
    ) {
      await updateOption.mutateAsync({
        key: 'RelayUserAgentBlacklist',
        value: blacklist,
      })
    }

    if (
      values.RelayUserAgentBlacklistEnabled !==
      props.defaultValues.RelayUserAgentBlacklistEnabled
    ) {
      await updateOption.mutateAsync({
        key: 'RelayUserAgentBlacklistEnabled',
        value: values.RelayUserAgentBlacklistEnabled,
      })
    }
  }

  return (
    <SettingsSection title={t('User-Agent Restrictions')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save User-Agent restrictions'
          />
          <FormField
            control={form.control}
            name='RelayUserAgentBlacklistEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable User-Agent restrictions')}</FormLabel>
                  <FormDescription>
                    {t('Only applies to model relay APIs.')}
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
            name='RelayUserAgentBlacklist'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Blocked User-Agent patterns')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={12}
                    placeholder={'(?i)^go-http-client/\n^curl/'}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Enter one Go RE2 regular expression per line. Matching is case-sensitive by default; use (?i)^go-http-client/ to ignore case. User-Agent values can be spoofed, so do not use this as the only security measure.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
