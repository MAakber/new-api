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
