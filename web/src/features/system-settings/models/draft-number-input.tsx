import {
  useEffect,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type MouseEvent as ReactMouseEvent,
} from 'react'

import { Input } from '@/components/ui/input'

function formatNumberDraft(value: number | string): string {
  if (value === '') return ''
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '0'
  }
  return value
}

function parseNumberDraft(value: string): number {
  if (value.trim() === '') return 0
  const next = Number(value)
  return Number.isFinite(next) ? next : 0
}

function isZeroDraft(value: string): boolean {
  return value.trim() !== '' && parseNumberDraft(value) === 0
}

type DraftNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'onChange'
> & {
  value: number | string
  onValueChange: (next: number) => void
  selectZeroOnFocus?: boolean
}

export function DraftNumberInput({
  value,
  onValueChange,
  selectZeroOnFocus = true,
  onBlur,
  onFocus,
  onMouseUp,
  ...props
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(() => formatNumberDraft(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) {
      setDraft(formatNumberDraft(value))
    }
  }, [focused, value])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = event.target.value
    setDraft(nextDraft)
    onValueChange(parseNumberDraft(nextDraft))
  }

  const handleFocus = (event: FocusEvent<HTMLInputElement>) => {
    setFocused(true)
    onFocus?.(event)
    if (selectZeroOnFocus && isZeroDraft(event.currentTarget.value)) {
      event.currentTarget.select()
    }
  }

  const handleMouseUp = (event: ReactMouseEvent<HTMLInputElement>) => {
    onMouseUp?.(event)
    if (selectZeroOnFocus && isZeroDraft(event.currentTarget.value)) {
      event.preventDefault()
      event.currentTarget.select()
    }
  }

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    const normalized = parseNumberDraft(event.currentTarget.value)
    setFocused(false)
    setDraft(String(normalized))
    onValueChange(normalized)
    onBlur?.(event)
  }

  return (
    <Input
      {...props}
      type='number'
      value={draft}
      onChange={handleChange}
      onFocus={handleFocus}
      onMouseUp={handleMouseUp}
      onBlur={handleBlur}
    />
  )
}
