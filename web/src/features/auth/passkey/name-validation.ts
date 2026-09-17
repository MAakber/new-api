import type { PasskeyCredentialSummary } from './types'

export const MAX_PASSKEYS_PER_USER = 10
export const MAX_PASSKEY_NAME_LENGTH = 64

export type PasskeyNameValidationError =
  | 'required'
  | 'too-long'
  | 'duplicate'
  | null

export function validatePasskeyName(
  rawName: string,
  credentials: PasskeyCredentialSummary[]
): PasskeyNameValidationError {
  const name = rawName.trim()
  if (!name) return 'required'
  if ([...name].length > MAX_PASSKEY_NAME_LENGTH) return 'too-long'
  if (
    credentials.some(
      (credential) =>
        credential.display_name.trim().toLocaleLowerCase() ===
        name.toLocaleLowerCase()
    )
  ) {
    return 'duplicate'
  }
  return null
}
