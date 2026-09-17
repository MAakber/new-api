import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import type { ParameterEnabled, PlaygroundConfig } from '../../../types'
import { buildChatCompletionPayload } from '../payload-builder'

const parameterEnabled: ParameterEnabled = {
  temperature: true,
  top_p: true,
  max_tokens: false,
  frequency_penalty: true,
  presence_penalty: true,
  seed: false,
  reasoning_effort: false,
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
    reasoning_effort: 'medium',
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
