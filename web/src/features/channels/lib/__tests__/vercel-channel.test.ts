import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
