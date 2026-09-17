import type { ChangeEvent } from 'react'
import type {
  ControllerRenderProps,
  FieldPath,
  FieldValues,
} from 'react-hook-form'
import { z } from 'zod'

export function positiveIntegerSchema(message: string) {
  return z.number().int(message).positive(message)
}

/**
 * Props produced by {@link safeNumberFieldProps} for a numeric input. They are
 * intentionally narrow so consumers can
 * spread them onto our shared `Input` component without leaking the
 * react-hook-form internals (e.g. `disabled`) that need overriding per call.
 */
export type SafeNumberFieldProps = {
  value: number | ''
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  name: string
  ref: (instance: HTMLInputElement | null) => void
}

/**
 * Adapter for binding a react-hook-form numeric field to a numeric input
 * without ever putting `NaN` into form state.
 *
 * Why this exists:
 * - Empty inputs must remain empty while the user edits them. Converting an
 *   empty string to zero makes it impossible to replace an existing value
 *   naturally and hides required-field validation errors.
 * - Invalid numeric tokens are ignored, while an empty string is forwarded as
 *   the explicit draft value used by the form validators.
 *
 * Display:
 * - When the underlying state is not a finite number, the prop returns `''`
 *   so the input visibly renders empty instead of literal "NaN".
 *
 * Usage:
 * ```tsx
 * <FormField
 *   control={form.control}
 *   name='performance_setting.monitor_cpu_threshold'
 *   render={({ field }) => (
 *     <Input type='number' min={0} {...safeNumberFieldProps(field)} />
 *   )}
 * />
 * ```
 */
export function safeNumberFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>(field: ControllerRenderProps<TFieldValues, TName>): SafeNumberFieldProps {
  const raw = field.value as unknown
  const display: number | '' =
    typeof raw === 'number' && Number.isFinite(raw) ? raw : ''

  return {
    value: display,
    onChange: (event) => {
      const rawValue = event.currentTarget.value
      if (rawValue === '') {
        ;(field.onChange as (value: number | '') => void)('')
        return
      }

      const next = Number(rawValue)
      if (Number.isFinite(next)) {
        ;(field.onChange as (value: number | '') => void)(next)
      }
    },
    onBlur: field.onBlur,
    name: field.name,
    ref: field.ref,
  }
}
