export type NumberInputValue = number | ''

export function parseNumberInputValue(value: string): NumberInputValue {
  if (value.trim() === '') return ''

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ''
}

export function parseIntegerInputValue(value: string): NumberInputValue {
  if (value.trim() === '') return ''

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : ''
}
