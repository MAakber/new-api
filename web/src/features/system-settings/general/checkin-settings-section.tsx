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
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useFieldArray, useForm, type Resolver } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

type BalanceTier = {
  minBalance: number
  minReward: number
  maxReward: number
}

type CheckinSettingsDefaults = {
  enabled: boolean
  minQuota: number
  maxQuota: number
  balanceTierEnabled: boolean
  balanceTiers: string
}

function parseBalanceTiers(value: string): BalanceTier[] {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []

    return parsed.flatMap((tier): BalanceTier[] => {
      if (
        !tier ||
        typeof tier !== 'object' ||
        typeof tier.min_balance !== 'number' ||
        typeof tier.min_reward !== 'number' ||
        typeof tier.max_reward !== 'number' ||
        !Number.isSafeInteger(tier.min_balance) ||
        !Number.isSafeInteger(tier.min_reward) ||
        !Number.isSafeInteger(tier.max_reward) ||
        tier.min_balance < 0 ||
        tier.min_reward < 0 ||
        tier.max_reward < 0
      ) {
        return []
      }

      return [
        {
          minBalance: tier.min_balance,
          minReward: tier.min_reward,
          maxReward: tier.max_reward,
        },
      ]
    })
  } catch {
    return []
  }
}

function serializeBalanceTiers(tiers: readonly BalanceTier[]): string {
  return JSON.stringify(
    tiers
      .map((tier) => ({
        min_balance: tier.minBalance,
        min_reward: tier.minReward,
        max_reward: tier.maxReward,
      }))
      .sort((left, right) => left.min_balance - right.min_balance)
  )
}

const createSchema = (t: (key: string) => string) => {
  const integerError = t('Value must be a non-negative integer')
  const nonNegativeInteger = () =>
    z.preprocess(
      (value) => (value === '' ? undefined : value),
      z
        .number({ error: integerError })
        .int({ error: integerError })
        .min(0, { error: integerError })
    )

  const balanceTierSchema = z
    .object({
      minBalance: nonNegativeInteger(),
      minReward: nonNegativeInteger(),
      maxReward: nonNegativeInteger(),
    })
    .refine((tier) => tier.minReward <= tier.maxReward, {
      path: ['maxReward'],
      message: t('Minimum reward must not exceed maximum reward'),
    })

  return z
    .object({
      enabled: z.boolean(),
      minQuota: nonNegativeInteger(),
      maxQuota: nonNegativeInteger(),
      balanceTierEnabled: z.boolean(),
      balanceTiers: z.array(balanceTierSchema).superRefine((tiers, ctx) => {
        const seenBalances = new Set<number>()
        tiers.forEach((tier, index) => {
          if (seenBalances.has(tier.minBalance)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'minBalance'],
              message: t('Minimum balances must be unique'),
            })
          }
          seenBalances.add(tier.minBalance)
        })
      }),
    })
    .superRefine((values, ctx) => {
      if (values.balanceTierEnabled && values.balanceTiers.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['balanceTiers'],
          message: t(
            'At least one valid balance reward tier is required when balance rewards are enabled'
          ),
        })
      }

      if (!values.balanceTierEnabled && values.minQuota > values.maxQuota) {
        ctx.addIssue({
          code: 'custom',
          path: ['maxQuota'],
          message: t(
            'Minimum check-in quota cannot exceed maximum check-in quota'
          ),
        })
      }
    })
}

type Values = z.infer<ReturnType<typeof createSchema>>

export function CheckinSettingsSection({
  defaultValues,
}: {
  defaultValues: CheckinSettingsDefaults
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const schema = useMemo(() => createSchema(t), [t])
  const initialValues = useMemo<Values>(
    () => ({
      enabled: defaultValues.enabled,
      minQuota: defaultValues.minQuota,
      maxQuota: defaultValues.maxQuota,
      balanceTierEnabled: defaultValues.balanceTierEnabled,
      balanceTiers: parseBalanceTiers(defaultValues.balanceTiers),
    }),
    [
      defaultValues.balanceTierEnabled,
      defaultValues.balanceTiers,
      defaultValues.enabled,
      defaultValues.maxQuota,
      defaultValues.minQuota,
    ]
  )

  const form = useForm<Values>({
    resolver: zodResolver(schema) as unknown as Resolver<Values>,
    defaultValues: initialValues,
  })
  const tiers = useFieldArray({ control: form.control, name: 'balanceTiers' })

  useEffect(() => {
    form.reset(initialValues)
  }, [form, initialValues])

  const { isDirty, isSubmitting } = form.formState
  const enabled = form.watch('enabled')
  const balanceTierEnabled = form.watch('balanceTierEnabled')
  const controlsDisabled = updateOption.isPending || isSubmitting

  async function onSubmit(values: Values) {
    const updates: Array<{ key: string; value: string }> = []

    const serializedTiers = serializeBalanceTiers(values.balanceTiers)
    const defaultSerializedTiers = serializeBalanceTiers(
      initialValues.balanceTiers
    )
    if (serializedTiers !== defaultSerializedTiers) {
      updates.push({
        key: 'checkin_setting.balance_tiers',
        value: serializedTiers,
      })
    }

    if (values.balanceTierEnabled !== defaultValues.balanceTierEnabled) {
      updates.push({
        key: 'checkin_setting.balance_tier_enabled',
        value: String(values.balanceTierEnabled),
      })
    }

    if (values.enabled !== defaultValues.enabled) {
      updates.push({
        key: 'checkin_setting.enabled',
        value: String(values.enabled),
      })
    }

    if (values.minQuota !== defaultValues.minQuota) {
      updates.push({
        key: 'checkin_setting.min_quota',
        value: String(values.minQuota),
      })
    }

    if (values.maxQuota !== defaultValues.maxQuota) {
      updates.push({
        key: 'checkin_setting.max_quota',
        value: String(values.maxQuota),
      })
    }

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }

    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }

    form.reset({
      ...values,
      balanceTiers: [...values.balanceTiers].sort(
        (left, right) => left.minBalance - right.minBalance
      ),
    })
  }

  return (
    <SettingsSection title={t('Check-in Settings')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)} autoComplete='off'>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || isSubmitting}
            isSaveDisabled={!isDirty}
            saveLabel='Save check-in settings'
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable check-in feature')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Allow users to check in daily for random quota rewards'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={controlsDisabled}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          {enabled && (
            <>
              <FormField
                control={form.control}
                name='balanceTierEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>
                        {t('Enable balance-based check-in rewards')}
                      </FormLabel>
                      <FormDescription>
                        {t(
                          'Use the user balance before check-in to select a reward tier'
                        )}
                      </FormDescription>
                    </SettingsSwitchContent>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={controlsDisabled}
                      />
                    </FormControl>
                  </SettingsSwitchItem>
                )}
              />

              {balanceTierEnabled ? (
                <>
                  <div className='space-y-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <div>
                        <p className='text-sm font-medium'>
                          {t('Balance reward tiers')}
                        </p>
                        <p className='text-muted-foreground text-sm'>
                          {t(
                            'The highest minimum balance not exceeding the user balance is selected; values below the first tier use the first tier.'
                          )}
                        </p>
                      </div>
                      <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        onClick={() =>
                          tiers.append({
                            minBalance: 0,
                            minReward: 0,
                            maxReward: 0,
                          })
                        }
                        disabled={controlsDisabled}
                      >
                        <Plus className='size-4' />
                        {t('Add tier')}
                      </Button>
                    </div>

                    {tiers.fields.length === 0 ? (
                      <div className='border-border text-muted-foreground rounded-md border border-dashed px-4 py-6 text-center text-sm'>
                        {t(
                          'No balance reward tiers configured. Add a tier to get started.'
                        )}
                      </div>
                    ) : (
                      <div className='space-y-2'>
                        <div className='text-muted-foreground hidden gap-3 px-3 text-xs sm:grid sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]'>
                          <span>{t('Minimum balance')}</span>
                          <span>{t('Minimum reward')}</span>
                          <span>{t('Maximum reward')}</span>
                          <span className='sr-only'>{t('Actions')}</span>
                        </div>
                        {tiers.fields.map((tier, index) => (
                          <div
                            key={tier.id}
                            className='border-border grid gap-3 rounded-md border p-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]'
                          >
                            <FormField
                              control={form.control}
                              name={`balanceTiers.${index}.minBalance`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className='sm:sr-only'>
                                    {t('Minimum balance')}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type='number'
                                      min={0}
                                      step={1}
                                      aria-label={t('Minimum balance')}
                                      placeholder={t('Minimum balance')}
                                      disabled={controlsDisabled}
                                      {...safeNumberFieldProps(field)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`balanceTiers.${index}.minReward`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className='sm:sr-only'>
                                    {t('Minimum reward')}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type='number'
                                      min={0}
                                      step={1}
                                      aria-label={t('Minimum reward')}
                                      placeholder={t('Minimum reward')}
                                      disabled={controlsDisabled}
                                      {...safeNumberFieldProps(field)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`balanceTiers.${index}.maxReward`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className='sm:sr-only'>
                                    {t('Maximum reward')}
                                  </FormLabel>
                                  <FormControl>
                                    <Input
                                      type='number'
                                      min={0}
                                      step={1}
                                      aria-label={t('Maximum reward')}
                                      placeholder={t('Maximum reward')}
                                      disabled={controlsDisabled}
                                      {...safeNumberFieldProps(field)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className='flex items-start justify-end gap-1'>
                              <Button
                                type='button'
                                size='icon-sm'
                                variant='ghost'
                                onClick={() => tiers.move(index, index - 1)}
                                disabled={controlsDisabled || index === 0}
                                aria-label={t('Move tier up')}
                                title={t('Move tier up')}
                              >
                                <ChevronUp className='size-4' />
                              </Button>
                              <Button
                                type='button'
                                size='icon-sm'
                                variant='ghost'
                                onClick={() => tiers.move(index, index + 1)}
                                disabled={
                                  controlsDisabled ||
                                  index === tiers.fields.length - 1
                                }
                                aria-label={t('Move tier down')}
                                title={t('Move tier down')}
                              >
                                <ChevronDown className='size-4' />
                              </Button>
                              <Button
                                type='button'
                                size='icon-sm'
                                variant='ghost'
                                onClick={() => tiers.remove(index)}
                                disabled={controlsDisabled}
                                aria-label={t('Remove tier')}
                                title={t('Remove tier')}
                              >
                                <Trash2 className='text-destructive size-4' />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <FormField
                    control={form.control}
                    name='balanceTiers'
                    render={() => (
                      <FormItem>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              ) : (
                <div className='grid gap-6 sm:grid-cols-2'>
                  <FormField
                    control={form.control}
                    name='minQuota'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Minimum check-in quota')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={0}
                            step={1}
                            placeholder={t('1000')}
                            disabled={controlsDisabled}
                            {...safeNumberFieldProps(field)}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Minimum quota amount awarded for check-in')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name='maxQuota'
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('Maximum check-in quota')}</FormLabel>
                        <FormControl>
                          <Input
                            type='number'
                            min={0}
                            step={1}
                            placeholder={t('10000')}
                            disabled={controlsDisabled}
                            {...safeNumberFieldProps(field)}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('Maximum quota amount awarded for check-in')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </>
          )}
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
