import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
