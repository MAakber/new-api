export type TelegramAuthorization = {
  id: string | number
  auth_date: string | number
  hash: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  lang?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function readTelegramNumber(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  return null
}

export function pickTelegramAuthorization(
  value: unknown
): TelegramAuthorization | null {
  if (!isRecord(value)) return null

  const id = readTelegramNumber(value.id)
  const authDate = readTelegramNumber(value.auth_date)
  const hash = typeof value.hash === 'string' ? value.hash.trim() : ''
  if (id === null || authDate === null || !hash) return null

  const authorization: TelegramAuthorization = {
    id,
    auth_date: authDate,
    hash,
  }
  const optionalFields = [
    'first_name',
    'last_name',
    'username',
    'photo_url',
    'lang',
  ] as const

  for (const field of optionalFields) {
    const fieldValue = value[field]
    if (typeof fieldValue === 'string' && fieldValue) {
      authorization[field] = fieldValue
    }
  }

  return authorization
}
