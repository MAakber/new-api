import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  CHANNEL_FORM_DEFAULT_VALUES,
  supportsChannelKeyAppend,
  transformFormDataToUpdatePayload,
} from '../channel-form'

describe('channel key append payload', () => {
  test('includes append mode for a single-key channel edit', () => {
    const payload = transformFormDataToUpdatePayload(
      {
        ...CHANNEL_FORM_DEFAULT_VALUES,
        name: 'OpenAI upstream',
        type: 1,
        key: 'new-key',
        models: 'gpt-test',
        key_mode: 'append',
      },
      42
    )

    assert.equal(payload.key, 'new-key')
    assert.equal(payload.key_mode, 'append')
  })

  test('hides append support for Codex and Vertex API-key channels', () => {
    assert.equal(supportsChannelKeyAppend(57, 'json'), false)
    assert.equal(supportsChannelKeyAppend(41, 'api_key'), false)
    assert.equal(supportsChannelKeyAppend(41, 'json'), true)

    const payload = transformFormDataToUpdatePayload(
      {
        ...CHANNEL_FORM_DEFAULT_VALUES,
        name: 'Vertex API key upstream',
        type: 41,
        vertex_key_type: 'api_key',
        key: 'new-key',
        models: 'gemini-test',
      },
      43
    )

    assert.equal('key_mode' in payload, false)
  })
})
