import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
