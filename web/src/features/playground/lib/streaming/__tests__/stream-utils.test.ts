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
  mergeWebSearchSources,
  normalizeWebSearchSources,
  parseStreamMessageUpdates,
} from '../stream-utils'

describe('web search stream updates', () => {
  test('parses and sanitizes source metadata without treating it as text', () => {
    const updates = parseStreamMessageUpdates(
      JSON.stringify({
        choices: [
          {
            delta: {
              content: 'answer',
              web_search: {
                sources: [
                  { href: 'https://example.com/article', title: 'Example' },
                  { href: 'https://example.com/article', title: 'Duplicate' },
                  { href: 'javascript:alert(1)', title: 'Unsafe' },
                  { href: 'https://docs.example.com' },
                ],
              },
            },
          },
        ],
      })
    )

    assert.deepEqual(updates, [
      { type: 'content', chunk: 'answer' },
      {
        type: 'sources',
        sources: [
          { href: 'https://example.com/article', title: 'Example' },
          { href: 'https://docs.example.com/', title: 'docs.example.com' },
        ],
      },
    ])
  })

  test('ignores malformed source metadata', () => {
    const updates = parseStreamMessageUpdates(
      JSON.stringify({
        choices: [
          {
            delta: {
              web_search: { sources: [{ href: 42 }, null, 'not-an-object'] },
            },
          },
        ],
      })
    )

    assert.deepEqual(updates, [])
  })

  test('merges sources by normalized URL and keeps a bounded list', () => {
    const current = [{ href: 'https://example.com', title: 'Example' }]
    const incoming = [
      { href: 'https://example.com/', title: 'Duplicate' },
      { href: 'http://other.example.com', title: '' },
    ]

    assert.deepEqual(mergeWebSearchSources(current, incoming), [
      { href: 'https://example.com/', title: 'Example' },
      { href: 'http://other.example.com/', title: 'other.example.com' },
    ])
  })

  test('returns an empty list for non-array values', () => {
    assert.deepEqual(normalizeWebSearchSources({}), [])
  })
})
