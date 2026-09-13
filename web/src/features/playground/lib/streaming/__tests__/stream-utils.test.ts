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

import { describe, expect, test } from 'vitest'

import {
  mergeWebSearchSources,
  normalizeWebSearchSources,
  parseStreamMessageUpdates,
} from '../stream-utils'

describe('web search stream updates', () => {
  test('preserves a usage-only final chunk including an explicit zero input count', () => {
    const updates = parseStreamMessageUpdates(
      JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 0, completion_tokens: 4, total_tokens: 4 },
      })
    )
    expect(updates).toMatchObject([
      {
        type: 'event',
        event: {
          type: 'usage',
          usage: { input_tokens: 0, output_tokens: 4, total_tokens: 4 },
        },
      },
    ])
  })

  test('retains a later cited result after the candidate list fills', () => {
    const sources = normalizeWebSearchSources([
      ...Array.from({ length: 40 }, (_, index) => ({
        href: `https://example.com/candidate/${index}`,
        title: 'Candidate',
      })),
      {
        href: 'https://example.com/quote',
        title: 'Current quote',
        cited: true,
      },
    ])
    expect(sources).toContainEqual(
      expect.objectContaining({
        href: 'https://example.com/quote',
        cited: true,
      })
    )
  })
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
