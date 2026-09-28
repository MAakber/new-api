import { describe, expect, test } from 'vitest'

import type { TaskPluginOption } from '../../api'
import {
  CHANNEL_TYPE_NEW_API,
  CHANNEL_TYPE_OPTIONS,
  MODEL_FETCHABLE_TYPES,
} from '../../constants'
import { channelSchema } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  channelFormSchema,
  transformChannelToFormDefaults,
  transformFormDataToCreatePayload,
} from '../channel-form'
import {
  getChannelPluginExtensions,
  readTaskExtendPluginKeys,
  supportsNewAPIUpstream,
} from '../channel-plugin-extensions'
import { getChannelTypeConfig } from '../channel-type-config'
import { getChannelTypeIcon, getKeyPromptForType } from '../channel-utils'

function newAPIForm(baseUrl: string) {
  return {
    ...CHANNEL_FORM_DEFAULT_VALUES,
    name: 'New API upstream',
    type: CHANNEL_TYPE_NEW_API,
    base_url: baseUrl,
    key: 'test-key',
    models: 'gpt-5',
  }
}

describe('New API channel', () => {
  test('registers selection, ordering, model discovery, and icon metadata', () => {
    const option = CHANNEL_TYPE_OPTIONS.find(
      (item) => item.value === CHANNEL_TYPE_NEW_API
    )

    expect(option).toEqual({
      value: CHANNEL_TYPE_NEW_API,
      label: 'New API',
    })
    expect(
      CHANNEL_TYPE_OPTIONS.findIndex(
        (item) => item.value === CHANNEL_TYPE_NEW_API
      ) + 1
    ).toBe(CHANNEL_TYPE_OPTIONS.findIndex((item) => item.value === 58))
    expect(MODEL_FETCHABLE_TYPES.has(CHANNEL_TYPE_NEW_API)).toBe(true)
    expect(getChannelTypeIcon(CHANNEL_TYPE_NEW_API)).toBe('NewAPI')
    expect(getKeyPromptForType(CHANNEL_TYPE_NEW_API)).toBe(
      'Enter API key for this channel'
    )
    expect(getChannelTypeConfig(CHANNEL_TYPE_NEW_API).icon).toBe('NewAPI')
  })

  test('requires a non-blank Base URL', () => {
    const blankResult = channelFormSchema.safeParse(newAPIForm('  '))

    expect(blankResult.success).toBe(false)
    if (!blankResult.success) {
      expect(
        blankResult.error.issues.some(
          (issue) =>
            issue.path[0] === 'base_url' &&
            issue.message === 'Base URL is required for this channel type'
        )
      ).toBe(true)
    }

    expect(
      channelFormSchema.safeParse(newAPIForm('https://new-api.example')).success
    ).toBe(true)
  })

  test('keeps Sub2API Base URL validation unchanged', () => {
    const result = channelFormSchema.safeParse({
      ...newAPIForm(''),
      type: 59,
    })

    expect(result.success).toBe(true)
  })
})

describe('New API channel task plugin extensions', () => {
  const plugins: TaskPluginOption[] = [
    {
      key: 'doubao',
      name: 'Doubao',
      models: ['seedance'],
      channelTypes: [45],
      upstreams: ['vendor', 'new_api'],
    },
    {
      key: 'kling',
      name: 'Kling',
      models: ['kling-v2'],
      upstreams: ['new_api'],
    },
    {
      key: 'hailuo',
      name: 'Hailuo',
      models: ['minimax'],
      upstreams: ['vendor'],
    },
  ]

  test('only plugins declaring a New API upstream can be bound to a New API channel', () => {
    expect(plugins.filter(supportsNewAPIUpstream).map((p) => p.key)).toEqual([
      'doubao',
      'kling',
    ])
    expect(supportsNewAPIUpstream({ upstreams: null })).toBe(false)
    expect(supportsNewAPIUpstream({})).toBe(false)
  })

  test('reads the extension list together with a single key on New API channels only', () => {
    expect(
      readTaskExtendPluginKeys(CHANNEL_TYPE_NEW_API, {
        task_plugin_key: 'kling',
        task_extend_plugin_keys: ['doubao', 'kling', '', 'doubao'],
      })
    ).toEqual(['kling', 'doubao'])
    expect(readTaskExtendPluginKeys(CHANNEL_TYPE_NEW_API, {})).toEqual([])
    expect(
      readTaskExtendPluginKeys(1, { task_extend_plugin_keys: ['doubao'] })
    ).toEqual([])
  })

  test('lists only bound plugins as extensions while other types keep declared channel types', () => {
    expect(
      getChannelPluginExtensions(CHANNEL_TYPE_NEW_API, plugins, ['kling'])
    ).toEqual([plugins[1]])
    expect(getChannelPluginExtensions(CHANNEL_TYPE_NEW_API, plugins)).toEqual(
      []
    )
    expect(getChannelPluginExtensions(45, plugins, ['kling'])).toEqual([
      plugins[0],
    ])
  })

  test('round-trips bound plugins through the channel setting for New API channels only', () => {
    const channel = channelSchema.parse({
      id: 7,
      name: 'Gateway',
      type: CHANNEL_TYPE_NEW_API,
      key: '',
      status: 1,
      created_time: 1,
      test_time: 0,
      response_time: 0,
      balance_updated_time: 0,
      models: 'seedance',
      group: 'default',
      base_url: 'https://gateway.example',
      setting: JSON.stringify({
        task_plugin_key: 'kling',
        task_extend_plugin_keys: ['doubao'],
      }),
    })
    expect(
      transformChannelToFormDefaults(channel).task_extend_plugin_keys
    ).toEqual(['kling', 'doubao'])

    const gateway = transformFormDataToCreatePayload(
      channelFormSchema.parse({
        ...newAPIForm('https://gateway.example'),
        task_extend_plugin_keys: ['doubao', 'kling'],
      })
    )
    const gatewaySetting = JSON.parse(gateway.channel.setting ?? '{}')
    expect(gatewaySetting).toMatchObject({
      task_extend_plugin_keys: ['doubao', 'kling'],
    })
    expect(gatewaySetting).not.toHaveProperty('task_plugin_key')

    const openai = transformFormDataToCreatePayload(
      channelFormSchema.parse({
        ...newAPIForm('https://gateway.example'),
        type: 1,
        task_extend_plugin_keys: ['doubao'],
      })
    )
    expect(JSON.parse(openai.channel.setting ?? '{}')).not.toHaveProperty(
      'task_extend_plugin_keys'
    )
  })
})
