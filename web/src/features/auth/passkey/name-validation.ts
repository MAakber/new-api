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
