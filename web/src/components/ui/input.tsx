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
import { Input as InputPrimitive } from '@base-ui/react/input'
import { ChevronDown, ChevronUp } from 'lucide-react'
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

function Input({
  className,
  type,
  ...props
}: React.ComponentPropsWithRef<'input'>) {
  if (type === 'number') {
    return <NumberInput className={className} {...props} />
  }

  return (
    <InputPrimitive
      type={type}
      data-slot='input'
      className={cn(
        'border-input file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-3 focus-visible:ring-inset disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-inset md:text-sm',
        className
      )}
      {...props}
    />
  )
}

function NumberInput({
  className,
  disabled,
  max,
  min,
  readOnly,
  ref,
  step,
  ...props
}: React.ComponentPropsWithRef<'input'>) {
  const { t } = useTranslation()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    },
    [ref]
  )

  const handleStep = React.useCallback(
    (direction: 1 | -1) => {
      const input = inputRef.current
      if (!input || disabled || readOnly) return

      const previousValue = input.value
      try {
        if (direction === 1) {
          input.stepUp()
        } else {
          input.stepDown()
        }
      } catch {
        const stepValue = Number(step)
        const safeStep =
          Number.isFinite(stepValue) && stepValue > 0 ? stepValue : 1
        const currentValue = Number(input.value)
        const minValue = Number(min)
        const maxValue = Number(max)
        let nextValue: number
        if (Number.isFinite(currentValue)) {
          nextValue = currentValue + direction * safeStep
        } else if (Number.isFinite(minValue)) {
          nextValue = minValue
        } else if (direction === 1) {
          nextValue = safeStep
        } else {
          nextValue = -safeStep
        }

        if (Number.isFinite(minValue)) {
          nextValue = Math.max(minValue, nextValue)
        }
        if (Number.isFinite(maxValue)) {
          nextValue = Math.min(maxValue, nextValue)
        }
        input.value = String(nextValue)
      }

      if (input.value === previousValue) return

      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )?.set
      valueSetter?.call(input, input.value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
    },
    [disabled, max, min, readOnly, step]
  )

  return (
    <div
      data-slot='number-input'
      className={cn(
        'border-input bg-transparent has-aria-invalid:border-destructive has-aria-invalid:ring-destructive/20 has-aria-invalid:ring-3 has-disabled:bg-input/50 focus-within:border-ring focus-within:ring-ring/50 dark:bg-input/30 dark:has-aria-invalid:border-destructive/50 dark:has-aria-invalid:ring-destructive/40 dark:has-disabled:bg-input/80 relative flex h-8 w-full min-w-0 items-stretch overflow-hidden rounded-lg border transition-colors focus-within:ring-3',
        className
      )}
    >
      <InputPrimitive
        type='number'
        data-slot='input'
        disabled={disabled}
        max={max}
        min={min}
        readOnly={readOnly}
        ref={setInputRef}
        step={step}
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 h-full min-w-0 flex-1 w-auto rounded-none border-0 bg-transparent px-2.5 py-1 pr-2 text-base outline-none transition-colors [appearance:textfield] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none md:text-sm',
          className
        )}
        {...props}
      />
      <div className='bg-background/70 border-input grid h-full w-6 shrink-0 grid-rows-2 border-l'>
        <button
          type='button'
          tabIndex={-1}
          aria-label={t('Add')}
          disabled={disabled || readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleStep(1)}
          className='text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted flex min-h-0 items-center justify-center p-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-40'
        >
          <ChevronUp className='size-3' aria-hidden='true' />
        </button>
        <button
          type='button'
          tabIndex={-1}
          aria-label={t('Subtract')}
          disabled={disabled || readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => handleStep(-1)}
          className='border-input text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted flex min-h-0 items-center justify-center border-t p-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset disabled:pointer-events-none disabled:opacity-40'
        >
          <ChevronDown className='size-3' aria-hidden='true' />
        </button>
      </div>
    </div>
  )
}

export { Input }
