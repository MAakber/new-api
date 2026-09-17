import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { buildLinuxDOOAuthUrl } from '../oauth'

describe('LinuxDO OAuth URL', () => {
  test('requests the profile scope and encodes OAuth parameters', () => {
    const url = new URL(buildLinuxDOOAuthUrl('client id', 'state with spaces'))

    assert.equal(url.origin, 'https://connect.linux.do')
    assert.equal(url.pathname, '/oauth2/authorize')
    assert.equal(url.searchParams.get('response_type'), 'code')
    assert.equal(url.searchParams.get('client_id'), 'client id')
    assert.equal(url.searchParams.get('scope'), 'openid profile')
    assert.equal(url.searchParams.get('state'), 'state with spaces')
  })
})
