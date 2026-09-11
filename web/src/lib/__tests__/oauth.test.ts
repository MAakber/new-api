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
