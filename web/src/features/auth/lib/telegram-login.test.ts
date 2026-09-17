import { describe, expect, test } from 'vitest'

import { pickTelegramAuthorization } from './telegram-login'

describe('Telegram login authorization', () => {
  test('keeps only fields signed by the Telegram login contract', () => {
    expect(
      pickTelegramAuthorization({
        id: 12345,
        first_name: 'Test',
        last_name: 'User',
        username: 'test_user',
        photo_url: 'https://t.me/i/userpic/320/test.jpg',
        auth_date: 1_900_000_000,
        hash: 'signed-hash',
        lang: 'en',
        admin: true,
        redirect: 'https://attacker.example',
      })
    ).toEqual({
      id: 12345,
      first_name: 'Test',
      last_name: 'User',
      username: 'test_user',
      photo_url: 'https://t.me/i/userpic/320/test.jpg',
      auth_date: 1_900_000_000,
      hash: 'signed-hash',
      lang: 'en',
    })
  })

  test('rejects incomplete or structurally invalid callbacks', () => {
    expect(pickTelegramAuthorization(null)).toBe(null)
    expect(pickTelegramAuthorization({ auth_date: 1, hash: 'hash' })).toBe(null)
    expect(pickTelegramAuthorization({ id: 1, auth_date: 1, hash: '' })).toBe(
      null
    )
    expect(
      pickTelegramAuthorization({ id: {}, auth_date: 1, hash: 'hash' })
    ).toBe(null)
  })
})
