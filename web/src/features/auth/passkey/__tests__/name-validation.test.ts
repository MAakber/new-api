import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
