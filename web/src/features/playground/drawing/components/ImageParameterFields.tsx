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
import { useController, useFormContext, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDrawingStore } from '@/stores/drawing-store'

import { getImageModelFamily, getImageQualities } from '../lib/image-settings'
import type { ImageSettings } from '../types'
import { ImageSizeFields } from './ImageSizeFields'

type SelectFieldProps = {
  name:
    | 'quality'
    | 'outputFormat'
    | 'responseFormat'
    | 'background'
    | 'moderation'
    | 'inputFidelity'
    | 'style'
  label: string
  options: { value: string; label: string }[]
}

function ParameterSelect(props: SelectFieldProps) {
  const { t } = useTranslation()
  const form = useFormContext<ImageSettings>()
  const { field } = useController({ name: props.name, control: form.control })
  const options = props.options.map((option) => ({
    value: option.value,
    label: t(option.label),
  }))
  return (
    <div className='space-y-1.5'>
      <Label htmlFor={`drawing-${props.name}`}>{t(props.label)}</Label>
      <Select
        name={field.name}
        value={field.value}
        items={options}
        onValueChange={(value) => {
          if (value === null) return
          field.onChange(value)
          form.clearErrors('root')
          useDrawingStore.getState().updateSettings(form.getValues())
        }}
      >
        <SelectTrigger
          ref={field.ref}
          id={`drawing-${props.name}`}
          className='w-full'
          onBlur={field.onBlur}
          aria-invalid={Boolean(form.formState.errors[props.name])}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

export function ImageParameterFields() {
  const { t } = useTranslation()
  const form = useFormContext<ImageSettings>()
  const settings = useWatch({ control: form.control }) as ImageSettings
  const family = getImageModelFamily(settings.model)
  const qualityLabels: Record<string, string> = {
    auto: 'Auto',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    standard: 'Standard',
    hd: 'HD',
  }
  return (
    <>
      <ImageSizeFields
        key={settings.model}
        model={settings.model}
        size={settings.size}
        onChange={(size) => {
          form.clearErrors('root')
          form.setValue('size', size, { shouldDirty: true })
          useDrawingStore.getState().updateSettings({ size })
        }}
      />
      <div className='grid grid-cols-2 gap-3'>
        <ParameterSelect
          name='quality'
          label='Quality'
          options={getImageQualities(settings.model).map((quality) => ({
            value: quality,
            label: qualityLabels[quality],
          }))}
        />
        <div className='space-y-1.5'>
          <Label htmlFor='drawing-n'>{t('Image count')}</Label>
          <Input
            id='drawing-n'
            type='number'
            min={1}
            max={family === 'dall-e-3' ? 1 : 10}
            step={1}
            aria-invalid={Boolean(form.formState.errors.n)}
            {...form.register('n', { valueAsNumber: true })}
          />
        </div>
        <div className='col-span-2'>
          {family === 'gpt-image' && (
            <ParameterSelect
              name='outputFormat'
              label='Output format'
              options={[
                { value: 'png', label: 'PNG' },
                { value: 'jpeg', label: 'JPEG' },
                { value: 'webp', label: 'WebP' },
              ]}
            />
          )}
          {family !== 'gpt-image' && (
            <ParameterSelect
              name='responseFormat'
              label='Response format'
              options={[
                { value: 'b64_json', label: 'Base64' },
                { value: 'url', label: 'URL' },
              ]}
            />
          )}
        </div>
      </div>
      {family !== 'gpt-image' && settings.responseFormat === 'url' && (
        <p className='text-muted-foreground text-xs'>
          {t('Image URLs expire. Download results to keep a copy.')}
        </p>
      )}
      <Accordion>
        <AccordionItem value='advanced'>
          <AccordionTrigger className='py-2 text-xs'>
            {t('Advanced settings')}
          </AccordionTrigger>
          <AccordionContent className='space-y-4 pt-2'>
            {family === 'gpt-image' && (
              <>
                <div className='grid grid-cols-2 gap-3'>
                  <ParameterSelect
                    name='background'
                    label='Background'
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'opaque', label: 'Opaque' },
                      { value: 'transparent', label: 'Transparent' },
                    ]}
                  />
                  <ParameterSelect
                    name='moderation'
                    label='Moderation'
                    options={[
                      { value: 'auto', label: 'Auto' },
                      { value: 'low', label: 'Low' },
                    ]}
                  />
                </div>
                {settings.outputFormat !== 'png' && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='drawing-compression'>
                      {t('Output compression')}
                    </Label>
                    <Input
                      id='drawing-compression'
                      type='number'
                      min={0}
                      max={100}
                      step={1}
                      aria-invalid={Boolean(
                        form.formState.errors.outputCompression
                      )}
                      {...form.register('outputCompression', {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                )}
                {settings.mode === 'edit' && (
                  <ParameterSelect
                    name='inputFidelity'
                    label='Input fidelity'
                    options={[
                      { value: 'default', label: 'Model default' },
                      { value: 'high', label: 'High' },
                      { value: 'low', label: 'Low' },
                    ]}
                  />
                )}
                <label className='flex cursor-pointer items-center gap-2 text-sm'>
                  <input
                    type='checkbox'
                    className='accent-primary size-4'
                    {...form.register('stream')}
                  />
                  {t('Stream image previews')}
                </label>
                {settings.stream && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='drawing-partials'>
                      {t('Partial images')}
                    </Label>
                    <Input
                      id='drawing-partials'
                      type='number'
                      min={0}
                      max={3}
                      step={1}
                      aria-invalid={Boolean(
                        form.formState.errors.partialImages
                      )}
                      {...form.register('partialImages', {
                        valueAsNumber: true,
                      })}
                    />
                  </div>
                )}
              </>
            )}
            {family === 'dall-e-3' && (
              <ParameterSelect
                name='style'
                label='Style'
                options={[
                  { value: 'vivid', label: 'Vivid' },
                  { value: 'natural', label: 'Natural' },
                ]}
              />
            )}
            <div className='space-y-1.5'>
              <Label htmlFor='drawing-user'>{t('User identifier')}</Label>
              <Input
                id='drawing-user'
                {...form.register('user')}
                placeholder={t('Optional')}
                autoComplete='off'
                maxLength={512}
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}
