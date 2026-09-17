import { describe, expect, test } from 'vitest'

import type { AuthUser } from '@/stores/auth-store'

import { getSavedLanguage, sanitizeAuthRedirect } from './auth-redirect'

const origin = 'https://dashboard.example.com'

describe('authentication redirect validation', () => {
  test('preserves safe internal paths, search parameters, and fragments', () => {
    expect(sanitizeAuthRedirect('/console?tab=usage#recent', origin)).toBe(
      '/console?tab=usage#recent'
    )
    expect(
      sanitizeAuthRedirect(
        'https://dashboard.example.com/dashboard?tab=quota#daily',
        origin
      )
    ).toBe('/dashboard?tab=quota#daily')
  })

  test('rejects external and ambiguously parsed redirect targets', () => {
    const unsafeTargets: unknown[] = [
      undefined,
      '',
      'dashboard',
      '//attacker.example/path',
      'https://attacker.example/path',
      'javascript:alert(1)',
      '/\\attacker.example/path',
      'https:\\attacker.example/path',
    ]

    for (const target of unsafeTargets) {
      expect(sanitizeAuthRedirect(target, origin)).toBe(null)
    }
  })

  test('rejects invalid or non-HTTP application origins', () => {
    expect(sanitizeAuthRedirect('/dashboard', 'not-an-origin')).toBe(null)
    expect(sanitizeAuthRedirect('/dashboard', 'file:///tmp/app')).toBe(null)
  })
})

describe('saved authentication language', () => {
  const user: AuthUser = { id: 1, username: 'user', role: 1 }

  test('prefers the explicit user language', () => {
    expect(
      getSavedLanguage({
        ...user,
        language: 'ja',
        setting: { language: 'fr' },
      })
    ).toBe('ja')
  })

  test('reads object and JSON string settings', () => {
    expect(getSavedLanguage({ ...user, setting: { language: 'fr' } })).toBe(
      'fr'
    )
    expect(getSavedLanguage({ ...user, setting: '{"language":"ru"}' })).toBe(
      'ru'
    )
  })

  test('ignores malformed and non-string setting languages', () => {
    expect(getSavedLanguage({ ...user, setting: '{' })).toBe(undefined)
    expect(getSavedLanguage({ ...user, setting: { language: 123 } })).toBe(
      undefined
    )
  })
})
