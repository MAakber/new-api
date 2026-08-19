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
  CHANNEL_TYPE_OPTIONS,
  CHANNEL_TYPE_VERCEL,
  MODEL_FETCHABLE_TYPES,
} from '../../constants'
import { CHANNEL_FORM_DEFAULT_VALUES, channelFormSchema } from '../channel-form'
import { getChannelTypeConfig } from '../channel-type-config'
import { getChannelTypeIcon } from '../channel-utils'

describe('Vercel AI Gateway channel', () => {
  test('registers the channel with model discovery and the Vercel icon', () => {
    assert.deepEqual(
      CHANNEL_TYPE_OPTIONS.find((item) => item.value === CHANNEL_TYPE_VERCEL),
      { value: CHANNEL_TYPE_VERCEL, label: 'Vercel AI Gateway' }
    )
    assert.equal(MODEL_FETCHABLE_TYPES.has(CHANNEL_TYPE_VERCEL), true)
    assert.equal(getChannelTypeIcon(CHANNEL_TYPE_VERCEL), 'Vercel')
    assert.equal(
      getChannelTypeConfig(CHANNEL_TYPE_VERCEL).defaultBaseUrl,
      'https://ai-gateway.vercel.sh'
    )
  })

  test('accepts the provider default Base URL', () => {
    const result = channelFormSchema.safeParse({
      ...CHANNEL_FORM_DEFAULT_VALUES,
      name: 'Vercel free GLM',
      type: CHANNEL_TYPE_VERCEL,
      base_url: '',
      key: 'vck_test',
      models: 'zai/glm-5.2',
    })

    assert.equal(result.success, true)
  })
})
