import { describe, expect, test } from 'vitest'

import { getServerErrorMessageKey } from './server-error-message'

describe('server error message mapping', () => {
  test('maps the active-session limit to recovery instructions', () => {
    const message = getServerErrorMessageKey({ code: 'AUTH_SESSION_LIMIT' })

    expect(message ?? '').toMatch(/Sign out other sessions/)
    expect(message ?? '').toMatch(/reset your password/)
  })

  test('maps an Axios-shaped issuance limit to rolling-window guidance', () => {
    const message = getServerErrorMessageKey({
      response: { data: { code: 'AUTH_SESSION_ISSUANCE_LIMIT' } },
    })

    expect(message ?? '').toMatch(/rolling window/)
    expect(getServerErrorMessageKey({ code: 'UNKNOWN_CODE' })).toBe(null)
  })

  test('maps stable Telegram bind errors without exposing server text', () => {
    const expected = {
      TELEGRAM_BIND_DISABLED: 'Telegram binding is disabled.',
      TELEGRAM_BIND_INVALID_REQUEST:
        'The Telegram authorization request is invalid or expired.',
      TELEGRAM_BIND_FLOW_INVALID:
        'This Telegram binding request has expired or has already been used.',
      TELEGRAM_BIND_SESSION_INVALID:
        'The login session that started this Telegram binding is no longer valid.',
      TELEGRAM_BIND_ALREADY_BOUND: 'This Telegram account is already bound.',
      TELEGRAM_BIND_USER_DELETED: 'This user account no longer exists.',
      TELEGRAM_BIND_USER_DISABLED: 'This user account is disabled.',
      TELEGRAM_BIND_INTERNAL_ERROR:
        'Telegram binding failed. Please try again.',
    }

    for (const [code, message] of Object.entries(expected)) {
      expect(getServerErrorMessageKey({ code })).toBe(message)
    }

    expect(
      getServerErrorMessageKey({
        response: {
          data: { code: 'TELEGRAM_BIND_INTERNAL_ERROR', message: 'raw detail' },
        },
      })
    ).toBe(expected.TELEGRAM_BIND_INTERNAL_ERROR)
  })
})
