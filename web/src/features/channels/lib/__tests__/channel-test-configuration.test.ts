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
import { describe, expect, it } from 'vitest'

import type { Channel } from '../../types'
import {
  canDeleteProbeModel,
  getProbeConfigurationKey,
  getProbeEndpointHint,
  isProbeNotApplicable,
  type ChannelProbeId,
  type ChannelProbeResult,
} from '../channel-test'

const channel = { id: 1, type: 1, models: 'gpt-4o,gpt-image-2' } as Channel
const key = (probe: ChannelProbeId) =>
  getProbeConfigurationKey(channel, {
    model: 'gpt-4o',
    probe,
    endpoint: 'auto',
    message: '',
  })
const result = (
  probe: ChannelProbeId,
  status: ChannelProbeResult['status']
): ChannelProbeResult => ({
  model: 'gpt-4o',
  probe,
  endpoint: 'auto',
  message: '',
  configurationKey: key(probe),
  status,
})

describe('channel test configuration', () => {
  it('keeps each capability and endpoint distinct while tool probes ignore the basic message', () => {
    const basic = {
      model: 'gpt-4o',
      probe: 'basic' as const,
      endpoint: 'auto',
      message: '',
    }
    const tool = { ...basic, probe: 'tool' as const }
    expect(getProbeConfigurationKey(channel, basic)).not.toBe(
      getProbeConfigurationKey(channel, { ...basic, probe: 'stream' })
    )
    expect(getProbeConfigurationKey(channel, basic)).not.toBe(
      getProbeConfigurationKey(channel, {
        ...basic,
        endpoint: 'openai-response',
      })
    )
    expect(getProbeConfigurationKey(channel, basic)).not.toBe(
      getProbeConfigurationKey(channel, { ...basic, message: 'changed' })
    )
    expect(getProbeConfigurationKey(channel, tool)).toBe(
      getProbeConfigurationKey(channel, { ...tool, message: 'changed' })
    )
    expect(getProbeConfigurationKey(channel, basic)).not.toBe(
      getProbeConfigurationKey(
        { ...channel, model_mapping: '{"gpt-4o":"gpt-5"}' },
        basic
      )
    )
  })

  it('classifies mapped image and compact models without excluding image streaming', () => {
    expect(
      getProbeEndpointHint(
        { ...channel, model_mapping: '{"alias":"gpt-image-2"}' },
        'alias',
        'auto'
      )
    ).toBe('image-generation')
    expect(getProbeEndpointHint(channel, 'gpt-4o-openai-compact', 'auto')).toBe(
      'openai-response-compact'
    )
    expect(
      getProbeEndpointHint(channel, 'gpt-image-2', 'openai-response')
    ).toBe('openai-response')
    expect(isProbeNotApplicable('image-generation', 'stream')).toBe(false)
    expect(isProbeNotApplicable('image-generation', 'tool')).toBe(true)
    expect(isProbeNotApplicable('embeddings', 'stream')).toBe(true)
  })

  it('only allows deletion after every applicable current basic test fails', () => {
    expect(
      canDeleteProbeModel({ basic: result('basic', 'failed') }, 'openai', key)
    ).toBe(false)
    expect(
      canDeleteProbeModel(
        {
          basic: result('basic', 'passed'),
          stream: result('stream', 'passed'),
          tool: result('tool', 'failed'),
        },
        'openai',
        key
      )
    ).toBe(false)
    expect(
      canDeleteProbeModel(
        {
          basic: result('basic', 'failed'),
          stream: result('stream', 'degraded'),
        },
        'openai',
        key
      )
    ).toBe(false)
    expect(
      canDeleteProbeModel(
        {
          basic: result('basic', 'failed'),
          stream: {
            ...result('stream', 'failed'),
            configurationKey: 'old-settings',
          },
        },
        'openai',
        key
      )
    ).toBe(false)
    expect(
      canDeleteProbeModel(
        {
          basic: result('basic', 'failed'),
          stream: result('stream', 'failed'),
        },
        'openai',
        key
      )
    ).toBe(true)
    expect(
      canDeleteProbeModel(
        { basic: result('basic', 'failed') },
        'embeddings',
        key
      )
    ).toBe(true)
    expect(
      canDeleteProbeModel(
        {
          basic: {
            ...result('basic', 'failed'),
            errorCode: 'model_price_error',
          },
          stream: result('stream', 'failed'),
        },
        'openai',
        key
      )
    ).toBe(false)
  })
})
