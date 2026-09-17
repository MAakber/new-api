import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CONFIG,
  DEFAULT_PARAMETER_ENABLED,
  STORAGE_KEYS,
} from '../../../constants'
import {
  getInitialParameterEnabled,
  getInitialPlaygroundConfig,
} from '../../state/playground-state-utils'
import { saveConfig, saveParameterEnabled } from '../../storage/storage'
import { buildChatCompletionPayload } from '../../streaming/payload-builder'

describe('Reasoning effort settings', () => {
  it('sends the chosen effort only when enabled and accepts provider-specific values', () => {
    const config = { ...DEFAULT_CONFIG, reasoning_effort: ' custom-effort ' }
    const enabled = { ...DEFAULT_PARAMETER_ENABLED, reasoning_effort: true }
    expect(
      buildChatCompletionPayload([], config, enabled).reasoning_effort
    ).toBe('custom-effort')
    expect(
      buildChatCompletionPayload([], config, DEFAULT_PARAMETER_ENABLED)
    ).not.toHaveProperty('reasoning_effort')
    expect(
      buildChatCompletionPayload(
        [],
        { ...config, reasoning_effort: ' ' },
        enabled
      )
    ).not.toHaveProperty('reasoning_effort')
  })

  it('restores the effort and toggle after reload without enabling it for old saved configurations', () => {
    localStorage.setItem(
      STORAGE_KEYS.CONFIG,
      JSON.stringify({ model: 'existing-model', temperature: 0.4 })
    )
    localStorage.setItem(
      STORAGE_KEYS.PARAMETER_ENABLED,
      JSON.stringify({ temperature: false })
    )
    expect(getInitialPlaygroundConfig()).toMatchObject({
      model: 'existing-model',
      temperature: 0.4,
      reasoning_effort: 'medium',
    })
    expect(getInitialParameterEnabled().reasoning_effort).toBe(false)

    saveConfig({ ...DEFAULT_CONFIG, reasoning_effort: 'xhigh' })
    saveParameterEnabled({
      ...DEFAULT_PARAMETER_ENABLED,
      reasoning_effort: true,
    })
    expect(getInitialPlaygroundConfig().reasoning_effort).toBe('xhigh')
    expect(getInitialParameterEnabled().reasoning_effort).toBe(true)
  })
})
