import { zodResolver } from '@hookform/resolvers/zod'
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
import { Input } from '@/components/ui/input'

import { SettingsForm } from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useResetForm } from '../hooks/use-reset-form'
import { useUpdateOption } from '../hooks/use-update-option'

const allowedProtocols = new Set(['http:', 'https:', 'socks5:', 'socks5h:'])

const isValidLoginProxyURL = (value: string) => {
  if (value === '') return true

  try {
    const url = new URL(value)
    return (
      allowedProtocols.has(url.protocol) &&
      Boolean(url.hostname) &&
      url.pathname === '/' &&
      url.search === '' &&
      url.hash === ''
    )
  } catch {
    return false
  }
}

const createLoginProxySchema = (t: (key: string) => string) =>
  z.object({
    LoginProxyURL: z
      .string()
      .trim()
      .refine(isValidLoginProxyURL, {
        message: t(
          'Enter a valid http, https, socks5, or socks5h proxy URL without a path, query, or fragment.'
        ),
      }),
  })

type LoginProxyFormValues = {
  LoginProxyURL: string
}

type LoginProxySectionProps = {
  defaultValues: LoginProxyFormValues
}

export function LoginProxySection({ defaultValues }: LoginProxySectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const loginProxySchema = createLoginProxySchema(t)
  const form = useForm<LoginProxyFormValues>({
    resolver: zodResolver(loginProxySchema),
    defaultValues,
  })

  useResetForm(form, defaultValues)

  const onSubmit = async (values: LoginProxyFormValues) => {
    const value = values.LoginProxyURL.trim()
    if (value !== defaultValues.LoginProxyURL) {
      await updateOption.mutateAsync({ key: 'LoginProxyURL', value })
    }
  }

  return (
    <SettingsSection title={t('Login Proxy')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='LoginProxyURL'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Login Proxy URL')}</FormLabel>
                <FormControl>
                  <Input
                    placeholder='socks5h://user:password@proxy.example.com:1080'
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Leave blank to disable. Supports http, https, socks5, and socks5h URLs with optional usernames and passwords; paths, queries, and fragments are not allowed. Only server-side requests to external login services such as GitHub, Discord, OIDC, LinuxDO, WeChat, and custom OAuth use this proxy. It does not affect model relay or other APIs. Changes take effect immediately after saving.'
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
