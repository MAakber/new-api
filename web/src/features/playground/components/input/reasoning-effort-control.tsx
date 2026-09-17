import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const effortOptions = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]

export function ReasoningEffortControl(props: {
  value: string
  enabled: boolean
  disabled?: boolean
  onValueChange: (value: string) => void
  onEnabledChange: (value: boolean) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  return (
    <div
      className={cn(
        'border-border/70 bg-background/60 grid gap-2 rounded-lg border p-3 transition-opacity',
        (!props.enabled || props.disabled) && 'opacity-55'
      )}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <label htmlFor={id} className='text-sm leading-5 font-medium'>
            {t('Reasoning effort')}
          </label>
          <p
            className='text-muted-foreground text-xs leading-4'
            id={`${id}-description`}
          >
            {t(
              'Controls how much the model thinks. Supported levels depend on the model; you can also enter a custom value.'
            )}
          </p>
        </div>
        <Switch
          checked={props.enabled}
          disabled={props.disabled}
          onCheckedChange={props.onEnabledChange}
          size='sm'
          aria-label={t('Enable {{parameter}}', {
            parameter: t('Reasoning effort'),
          })}
        />
      </div>
      <Combobox
        items={effortOptions}
        value={props.value || null}
        inputValue={props.value}
        onInputValueChange={props.onValueChange}
        onValueChange={(value) => {
          if (value !== null) props.onValueChange(value)
        }}
        disabled={props.disabled || !props.enabled}
      >
        <ComboboxInput
          id={id}
          aria-describedby={`${id}-description`}
          maxLength={64}
          placeholder={t('Select or type...')}
          disabled={props.disabled || !props.enabled}
          showTrigger={false}
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {t('Use a value supported by the selected model.')}
          </ComboboxEmpty>
          <ComboboxList>
            {(option: string) => (
              <ComboboxItem key={option} value={option}>
                {option}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
