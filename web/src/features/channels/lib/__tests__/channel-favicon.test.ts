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

import {
  getChannelFaviconUrl,
  getChannelOrigin,
  parseChannelBaseUrl,
} from '../channel-utils'

describe('channel favicon URL utilities', () => {
  test('requests favicon.ico from the upstream origin', () => {
    const baseUrl = ' https://provider.example/api/v1?tenant=main#chat '
    const parsedUrl = parseChannelBaseUrl(baseUrl)

    assert.ok(parsedUrl)
    assert.equal(
      parsedUrl.href,
      'https://provider.example/api/v1?tenant=main#chat'
    )
    assert.equal(getChannelOrigin(baseUrl), 'https://provider.example')
    assert.equal(
      getChannelFaviconUrl(baseUrl),
      'https://provider.example/favicon.ico'
    )
  })

  test('rejects missing, non-http, relative, and credential-bearing URLs', () => {
    const invalidUrls: Array<string | null | undefined> = [
      undefined,
      null,
      '',
      '  ',
      '/api/v1',
      'ftp://provider.example',
      'javascript:alert(1)',
      'data:text/html,unsafe',
      'https://user:password@provider.example/api',
    ]

    for (const baseUrl of invalidUrls) {
      assert.equal(parseChannelBaseUrl(baseUrl), null)
      assert.equal(getChannelOrigin(baseUrl), null)
      assert.equal(getChannelFaviconUrl(baseUrl), null)
    }
  })
})
