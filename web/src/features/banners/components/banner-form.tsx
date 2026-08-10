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

import type { SubmitHandler, UseFormReturn } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { DateTimePicker } from '@/components/datetime-picker'
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
import { Textarea } from '@/components/ui/textarea'

import {
  BANNER_SORT_ORDER_MAX,
  BANNER_SORT_ORDER_MIN,
  BANNER_TYPE_OPTIONS,
} from '../lib/banner-utils'
import type { BannerFormValues } from '../types'

type BannerFormProps = {
  form: UseFormReturn<BannerFormValues>
  formId: string
  onSubmit: SubmitHandler<BannerFormValues>
}

export function BannerForm(props: BannerFormProps) {
  const { t } = useTranslation()

  return (
    <Form {...props.form}>
      <form
        id={props.formId}
        onSubmit={props.form.handleSubmit(props.onSubmit)}
        className='space-y-4'
      >
        <FormField
          control={props.form.control}
          name='content'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Content')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={t(
                    'Enter banner content (supports Markdown/HTML)'
                  )}
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Maximum 500 characters. Supports Markdown and HTML.')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={props.form.control}
          name='enabled'
          render={({ field }) => (
            <FormItem className='flex flex-row items-center justify-between rounded-xl border px-3 py-2.5'>
              <div className='space-y-0.5'>
                <FormLabel>{t('Enabled')}</FormLabel>
                <FormDescription className='text-xs'>
                  {t('Show this banner on public pages')}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={props.form.control}
            name='publishDate'
            render={({ field }) => (
              <FormItem className='min-w-0'>
                <FormLabel>{t('Publish Date')}</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) =>
                      field.onChange(date ? date.toISOString() : '')
                    }
                    placeholder={t('Select publish date')}
                    className='w-full'
                  />
                </FormControl>
                <FormDescription>
                  {t('Date and time when this banner should be displayed')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={props.form.control}
            name='sortOrder'
            render={({ field }) => (
              <FormItem className='min-w-0'>
                <FormLabel>{t('Sort Order')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={BANNER_SORT_ORDER_MIN}
                    max={BANNER_SORT_ORDER_MAX}
                    step='1'
                    value={field.value}
                    onChange={(event) => {
                      const value = event.target.valueAsNumber
                      field.onChange(Number.isNaN(value) ? 0 : value)
                    }}
                  />
                </FormControl>
                <FormDescription>
                  {t('Optional priority. Higher values appear first.')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <FormField
            control={props.form.control}
            name='startDate'
            render={({ field }) => (
              <FormItem className='min-w-0'>
                <FormLabel>{t('Start date')}</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) =>
                      field.onChange(date ? date.toISOString() : '')
                    }
                    placeholder={t('Select date')}
                    className='w-full'
                  />
                </FormControl>
                <FormDescription>
                  {t('Optional start date for this banner')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={props.form.control}
            name='endDate'
            render={({ field }) => (
              <FormItem className='min-w-0'>
                <FormLabel>{t('End date')}</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) =>
                      field.onChange(date ? date.toISOString() : '')
                    }
                    placeholder={t('Select date')}
                    className='w-full'
                  />
                </FormControl>
                <FormDescription>
                  {t('Optional end date for this banner')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={props.form.control}
          name='type'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Type')}</FormLabel>
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={BANNER_TYPE_OPTIONS.map((option) => ({
                  value: option.value,
                  label: t(option.labelKey),
                }))}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('Select banner type')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {BANNER_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className='flex items-center gap-2'>
                          <div
                            aria-hidden='true'
                            className={`h-3 w-3 rounded-full ${option.color}`}
                          />
                          {t(option.labelKey)}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={props.form.control}
          name='link'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Link')}</FormLabel>
              <FormControl>
                <Input
                  type='url'
                  inputMode='url'
                  placeholder={t('Enter URL...')}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                {t('Optional HTTP or HTTPS destination')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={props.form.control}
          name='extra'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Extra Notes (Optional)')}</FormLabel>
              <FormControl>
                <Input placeholder={t('Additional information')} {...field} />
              </FormControl>
              <FormDescription>
                {t('Optional supplementary information (max 200 characters)')}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
