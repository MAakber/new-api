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
import { ShieldAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import * as z from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { AutoBanHistory } from './auto-ban-history'
import {
  AUTO_BAN_RULE_DESCRIPTIONS,
  AUTO_BAN_RULE_KEYS,
  AUTO_BAN_RULE_LABELS,
  DEFAULT_AUTO_BAN_CONFIG,
  type AutoBanConfig,
  type AutoBanFormValues,
  type AutoBanRuleKey,
} from './auto-ban-types'

const responseCodePattern = /^[A-Za-z0-9_.-]+$/
const userIDListPattern = /^\d+$/

const createRuleSchema = (t: (key: string) => string) =>
  z.object({
    enabled: z.boolean(),
    mode: z.enum(['observe', 'enforce']),
    threshold: z.number().int().min(1).max(100000),
    window_minutes: z.number().int().min(1).max(525600),
    ban_duration_minutes: z
      .number()
      .int()
      .refine((value) => value === -1 || (value >= 1 && value <= 525600), {
        message: t('Enter -1 or a value from 1 to 525600.'),
      }),
    response_status: z.number().int().min(400).max(599),
    response_message: z.string().trim().min(1).max(500),
    response_code: z.string().trim().min(1).max(64).regex(responseCodePattern),
  })

const createAutoBanSchema = (t: (key: string) => string) => {
  const ruleSchema = createRuleSchema(t)

  return z.object({
    enabled: z.boolean(),
    exempt_user_ids_text: z.string().refine(
      (value) =>
        value
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean)
          .every(
            (item) =>
              userIDListPattern.test(item) &&
              Number.isSafeInteger(Number(item)) &&
              Number(item) > 0
          ),
      { message: t('User IDs must be positive integers') }
    ),
    exempt_groups_text: z.string(),
    exempt_ip_cidrs_text: z.string(),
    sensitive_words: ruleSchema,
    user_agent: ruleSchema,
    excessive_ips: ruleSchema,
    model_probing: ruleSchema,
  })
}

type AutoBanSectionProps = {
  defaultValues: {
    AutoBanConfig: string
  }
}

const cloneRule = (rule: AutoBanConfig['sensitive_words']) => ({ ...rule })

const parseAutoBanConfig = (value: string): AutoBanConfig => {
  try {
    const parsed = JSON.parse(value) as Partial<AutoBanConfig>
    return {
      ...DEFAULT_AUTO_BAN_CONFIG,
      ...parsed,
      exempt_user_ids: Array.isArray(parsed.exempt_user_ids)
        ? parsed.exempt_user_ids
        : [],
      exempt_groups: Array.isArray(parsed.exempt_groups)
        ? parsed.exempt_groups
        : [],
      exempt_ip_cidrs: Array.isArray(parsed.exempt_ip_cidrs)
        ? parsed.exempt_ip_cidrs
        : [],
      sensitive_words: {
        ...cloneRule(DEFAULT_AUTO_BAN_CONFIG.sensitive_words),
        ...parsed.sensitive_words,
      },
      user_agent: {
        ...cloneRule(DEFAULT_AUTO_BAN_CONFIG.user_agent),
        ...parsed.user_agent,
      },
      excessive_ips: {
        ...cloneRule(DEFAULT_AUTO_BAN_CONFIG.excessive_ips),
        ...parsed.excessive_ips,
      },
      model_probing: {
        ...cloneRule(DEFAULT_AUTO_BAN_CONFIG.model_probing),
        ...parsed.model_probing,
      },
    }
  } catch {
    return structuredClone(DEFAULT_AUTO_BAN_CONFIG)
  }
}

const configToFormValues = (config: AutoBanConfig): AutoBanFormValues => ({
  enabled: config.enabled,
  exempt_user_ids_text: config.exempt_user_ids.join('\n'),
  exempt_groups_text: config.exempt_groups.join('\n'),
  exempt_ip_cidrs_text: config.exempt_ip_cidrs.join('\n'),
  sensitive_words: cloneRule(config.sensitive_words),
  user_agent: cloneRule(config.user_agent),
  excessive_ips: cloneRule(config.excessive_ips),
  model_probing: cloneRule(config.model_probing),
})

const normalizeLines = (value: string) => [
  ...new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter(Boolean)
  ),
]

const formValuesToConfig = (values: AutoBanFormValues): AutoBanConfig => ({
  enabled: values.enabled,
  exempt_user_ids: normalizeLines(values.exempt_user_ids_text)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((left, right) => left - right),
  exempt_groups: normalizeLines(values.exempt_groups_text).sort(),
  exempt_ip_cidrs: normalizeLines(values.exempt_ip_cidrs_text).sort(),
  sensitive_words: cloneRule(values.sensitive_words),
  user_agent: cloneRule(values.user_agent),
  excessive_ips: cloneRule(values.excessive_ips),
  model_probing: cloneRule(values.model_probing),
})

function AutoBanRuleCard(props: {
  ruleKey: AutoBanRuleKey
  form: UseFormReturn<AutoBanFormValues>
}) {
  const { t } = useTranslation()
  const fieldName = (name: string) =>
    `${props.ruleKey}.${name}` as FieldPath<AutoBanFormValues>

  return (
    <Card size='sm' data-card-hover='false'>
      <CardHeader>
        <CardTitle>{t(AUTO_BAN_RULE_LABELS[props.ruleKey])}</CardTitle>
        <CardDescription>
          {t(AUTO_BAN_RULE_DESCRIPTIONS[props.ruleKey])}
        </CardDescription>
        <CardAction>
          <FormField
            control={props.form.control}
            name={fieldName('enabled')}
            render={({ field }) => (
              <Switch
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                aria-label={t('Enable this automatic ban rule')}
              />
            )}
          />
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid items-start gap-4 md:grid-cols-4'>
          <FormField
            control={props.form.control}
            name={fieldName('mode')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Rule mode')}</FormLabel>
                <Select
                  items={[
                    { value: 'observe', label: t('Observe only') },
                    { value: 'enforce', label: t('Enforce ban') },
                  ]}
                  value={String(field.value)}
                  onValueChange={field.onChange}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='observe'>
                        {t('Observe only')}
                      </SelectItem>
                      <SelectItem value='enforce'>
                        {t('Enforce ban')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          {[
            ['threshold', 'Threshold', 'times'],
            ['window_minutes', 'Counting window', 'minutes'],
            ['ban_duration_minutes', 'Ban duration', 'minutes'],
          ].map(([name, label, unit]) => (
            <FormField
              key={name}
              control={props.form.control}
              name={fieldName(name)}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(label)}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={name === 'ban_duration_minutes' ? -1 : 1}
                      value={Number(field.value)}
                      onChange={(event) =>
                        field.onChange(Number(event.target.value))
                      }
                    />
                  </FormControl>
                  <FormDescription>
                    {name === 'ban_duration_minutes' ? (
                      <>
                        {t(unit)} · {t('-1 means permanent ban')}
                      </>
                    ) : (
                      t(unit)
                    )}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>

        <div className='grid items-start gap-4 md:grid-cols-[140px_1fr_2fr]'>
          <FormField
            control={props.form.control}
            name={fieldName('response_status')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('HTTP status')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={400}
                    max={599}
                    value={Number(field.value)}
                    onChange={(event) =>
                      field.onChange(Number(event.target.value))
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.form.control}
            name={fieldName('response_code')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Error code')}</FormLabel>
                <FormControl>
                  <Input
                    value={String(field.value)}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={props.form.control}
            name={fieldName('response_message')}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Error message')}</FormLabel>
                <FormControl>
                  <Input
                    value={String(field.value)}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  )
}

export function AutoBanSection(props: AutoBanSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [activeTab, setActiveTab] = useState('rules')
  const parsedDefaults = useMemo(
    () => parseAutoBanConfig(props.defaultValues.AutoBanConfig),
    [props.defaultValues.AutoBanConfig]
  )
  const autoBanSchema = useMemo(() => createAutoBanSchema(t), [t])
  const baselineRef = useRef(JSON.stringify(parsedDefaults))
  const form = useForm<AutoBanFormValues>({
    resolver: zodResolver(autoBanSchema),
    mode: 'onChange',
    defaultValues: configToFormValues(parsedDefaults),
  })

  useEffect(() => {
    baselineRef.current = JSON.stringify(parsedDefaults)
    form.reset(configToFormValues(parsedDefaults))
  }, [form, parsedDefaults])

  const onSubmit = async (values: AutoBanFormValues) => {
    const config = formValuesToConfig(values)
    const serialized = JSON.stringify(config)
    if (serialized === baselineRef.current) {
      toast.info(t('No changes to save'))
      return
    }
    await updateOption.mutateAsync({ key: 'AutoBanConfig', value: serialized })
    baselineRef.current = serialized
    form.reset(configToFormValues(config))
  }

  return (
    <SettingsSection title={t('Automatic Account Bans')}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className='grid w-full grid-cols-2'>
          <TabsTrigger value='rules'>{t('Rules')}</TabsTrigger>
          <TabsTrigger value='history'>{t('Ban history')}</TabsTrigger>
        </TabsList>
        <TabsContent value='rules' className='mt-6'>
          <Form {...form}>
            <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
              <SettingsPageFormActions
                onSave={form.handleSubmit(onSubmit)}
                isSaving={updateOption.isPending}
                saveLabel='Save automatic ban rules'
              />
              <Alert variant='destructive'>
                <ShieldAlert />
                <AlertTitle>
                  {t('Automatic enforcement can lock users out')}
                </AlertTitle>
                <AlertDescription>
                  {t(
                    'Start new rules in observe-only mode, review the history, and switch to enforcement only after confirming the thresholds. Root and administrator accounts are always exempt.'
                  )}
                </AlertDescription>
              </Alert>

              <FormField
                control={form.control}
                name='enabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>
                        {t('Enable automatic account bans')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Temporarily blocks login and all API access when an enforcing rule reaches its threshold.'
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

              <div className='grid gap-4 lg:grid-cols-3'>
                <FormField
                  control={form.control}
                  name='exempt_user_ids_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Exempt user IDs')}</FormLabel>
                      <FormControl>
                        <Textarea rows={5} placeholder={'12\n34'} {...field} />
                      </FormControl>
                      <FormDescription>
                        {t('One positive user ID per line.')}
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='exempt_groups_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Exempt user groups')}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={5}
                          placeholder={'trusted\ninternal'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t('One exact New API user group per line.')}
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name='exempt_ip_cidrs_text'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('Exempt IPs and CIDRs')}</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={5}
                          placeholder={'203.0.113.5\n2001:db8::/64'}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'One IP or CIDR per line. Client IP accuracy depends on TRUSTED_PROXIES.'
                        )}
                      </FormDescription>
                    </FormItem>
                  )}
                />
              </div>

              <div className='space-y-4'>
                {AUTO_BAN_RULE_KEYS.map((ruleKey) => (
                  <AutoBanRuleCard
                    key={ruleKey}
                    ruleKey={ruleKey}
                    form={form}
                  />
                ))}
              </div>
            </SettingsForm>
          </Form>
        </TabsContent>
        <TabsContent value='history' className='mt-6'>
          <AutoBanHistory />
        </TabsContent>
      </Tabs>
    </SettingsSection>
  )
}
