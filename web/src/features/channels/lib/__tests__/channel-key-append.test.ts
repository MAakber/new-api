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
