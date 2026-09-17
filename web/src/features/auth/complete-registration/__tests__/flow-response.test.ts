import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { isPendingRegistrationChallenge } from '../flow-response'

describe('pending registration response', () => {
  test('accepts a registration-code challenge with a usable flow token', () => {
    assert.equal(
      isPendingRegistrationChallenge({
        require_registration_code: true,
        flow_token: 'pending-flow',
        expires_at: 1_900_000_000,
      }),
      true
    )
  })

  test('rejects authentication bundles and malformed challenges', () => {
    assert.equal(
      isPendingRegistrationChallenge({ access_token: 'access-token' }),
      false
    )
    assert.equal(
      isPendingRegistrationChallenge({
        require_registration_code: true,
        flow_token: '',
      }),
      false
    )
  })
})
