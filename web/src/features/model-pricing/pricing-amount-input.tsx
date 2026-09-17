import { useId, useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { InputGroupInput } from '@/components/ui/input-group'
import { formatPricingNumber } from '@/features/system-settings/models/pricing-format'

import { USD_PRICING_CURRENCY, type PricingCurrency } from './currency'

type PricingAmountInputProps = Omit<
  ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> & {
  value: string | number
  onChange: (usd: string) => void
  currency?: PricingCurrency
  grouped?: boolean
}

/** The parent owns USD; only this input owns the uncommitted display string. */
export function PricingAmountInput({
  value,
  onChange,
  currency = USD_PRICING_CURRENCY,
  grouped,
  ...props
}: PricingAmountInputProps) {
  const { t } = useTranslation()
  const errorId = useId()
  const source = String(value)
  const [draft, setDraft] = useState<{
    text: string
    source: string
    rate: number
  } | null>(null)
  const displayAmount = Number(value) * currency.exchangeRate
  let displayed = ''
  if (value !== '') {
    displayed = String(displayAmount)
    if (Number.isFinite(displayAmount)) {
      displayed = Number(formatPricingNumber(displayAmount)).toLocaleString(
        'en-US',
        {
          useGrouping: false,
          maximumFractionDigits: 12,
        }
      )
    }
  }
  const text =
    draft?.source === source && draft.rate === currency.exchangeRate
      ? draft.text
      : displayed
  const amount = text === '' || text === '.' ? 0 : Number(text)
  const usd = amount / currency.exchangeRate
  const invalid =
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(usd) ||
    !Number.isFinite(displayAmount)
  const error = invalid
    ? t('The converted price must be a finite, non-negative number.')
    : ''
  const Control = grouped ? InputGroupInput : Input

  return (
    <>
      <Control
        {...props}
        ref={(element) => {
          element?.setCustomValidity(error)
          if (typeof props.ref === 'function') return props.ref(element)
          if (props.ref) props.ref.current = element
        }}
        data-pricing-amount=''
        type='text'
        inputMode='decimal'
        value={text}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        aria-describedby={
          [props['aria-describedby'], invalid ? errorId : '']
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(event) => {
          const next = event.target.value
          if (!/^(\d+(\.\d*)?|\.\d*)?$/.test(next)) return
          const nextAmount = next === '.' || next === '' ? 0 : Number(next)
          const nextUSD = nextAmount / currency.exchangeRate
          if (!Number.isFinite(nextUSD) || !Number.isFinite(nextAmount)) {
            setDraft({ text: next, source, rate: currency.exchangeRate })
            return
          }
          const canonical =
            next === '' || next === '.' ? '' : formatPricingNumber(nextUSD)
          const nextSource =
            typeof value === 'number' ? String(Number(canonical)) : canonical
          setDraft({
            text: next,
            source: nextSource,
            rate: currency.exchangeRate,
          })
          if (nextSource !== source) onChange(canonical)
        }}
        onFocus={(event) => {
          props.onFocus?.(event)
          if (Number(event.currentTarget.value) === 0) {
            event.currentTarget.select()
          }
        }}
      />
      {invalid && (
        <span
          id={errorId}
          role='alert'
          data-pricing-error=''
          className={
            grouped
              ? 'text-destructive order-[10000] w-full px-2.5 pb-1 text-xs'
              : 'text-destructive block text-xs'
          }
        >
          {error}
        </span>
      )}
    </>
  )
}
