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
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { validatePasskeyName } from '../name-validation'
import type { PasskeyCredentialSummary } from '../types'

const credentials: PasskeyCredentialSummary[] = [
  {
    id: 1,
    display_name: 'Work Laptop',
    created_at: '2026-08-05T00:00:00Z',
    backup_eligible: false,
    backup_state: false,
  },
]

describe('Passkey display name validation', () => {
  test('rejects empty and whitespace-only names', () => {
    assert.equal(validatePasskeyName('   ', credentials), 'required')
  })

  test('rejects duplicate names ignoring case and surrounding whitespace', () => {
    assert.equal(validatePasskeyName(' work laptop ', credentials), 'duplicate')
  })

  test('rejects names longer than 64 Unicode characters', () => {
    assert.equal(
      validatePasskeyName('设备'.repeat(33), credentials),
      'too-long'
    )
  })

  test('accepts a distinct device name', () => {
    assert.equal(validatePasskeyName('Phone', credentials), null)
  })
})
