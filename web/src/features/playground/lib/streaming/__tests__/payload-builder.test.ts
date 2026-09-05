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

import type { ParameterEnabled, PlaygroundConfig } from '../../../types'
import { buildChatCompletionPayload } from '../payload-builder'

const parameterEnabled: ParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
}

function createConfig(webSearchEnabled: boolean): PlaygroundConfig {
  return {
    model: 'test-model',
    group: 'default',
    temperature: 0.7,
    top_p: 1,
    max_tokens: 4096,
    frequency_penalty: 0,
    presence_penalty: 0,
    seed: null,
    stream: true,
    webSearchEnabled,
  }
}

describe('playground web search payload', () => {
  test('sets web_search only when the toggle is enabled', () => {
    const enabled = buildChatCompletionPayload(
      [
        {
          key: 'user-1',
          from: 'user',
          versions: [{ id: 'v1', content: 'hi' }],
        },
      ],
      createConfig(true),
      parameterEnabled
    )
    const disabled = buildChatCompletionPayload(
      [
        {
          key: 'user-1',
          from: 'user',
          versions: [{ id: 'v1', content: 'hi' }],
        },
      ],
      createConfig(false),
      parameterEnabled
    )

    assert.equal(enabled.web_search, true)
    assert.equal('web_search' in disabled, false)
  })
})
