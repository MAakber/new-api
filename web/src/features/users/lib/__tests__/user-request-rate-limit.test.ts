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
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  getRequestsPerMinuteForMode,
  getUserRequestRateLimitMode,
  userFormSchema,
} from '../user-form'

describe('user request rate limit form', () => {
  test('maps the three UI modes to the backend values', () => {
    assert.equal(getRequestsPerMinuteForMode('default', null), null)
    assert.equal(getRequestsPerMinuteForMode('unlimited', 0), 0)
    assert.equal(getRequestsPerMinuteForMode('custom', 120), 120)
  })

  test('reads the backend values as the matching UI mode', () => {
    assert.equal(getUserRequestRateLimitMode(null), 'default')
    assert.equal(getUserRequestRateLimitMode(0), 'unlimited')
    assert.equal(getUserRequestRateLimitMode(120), 'custom')
  })

  test('accepts only whole custom RPM values in the supported range', () => {
    const base = {
      username: 'user',
      rpm_mode: 'custom' as const,
    }

    assert.equal(
      userFormSchema.safeParse({
        ...base,
        requests_per_minute: 1,
      }).success,
      true
    )
    assert.equal(
      userFormSchema.safeParse({
        ...base,
        requests_per_minute: 1_000_000,
      }).success,
      true
    )
    assert.equal(
      userFormSchema.safeParse({
        ...base,
        requests_per_minute: 0,
      }).success,
      false
    )
    assert.equal(
      userFormSchema.safeParse({
        ...base,
        requests_per_minute: 1_000_001,
      }).success,
      false
    )
    assert.equal(
      userFormSchema.safeParse({
        ...base,
        requests_per_minute: 1.5,
      }).success,
      false
    )
  })
})
