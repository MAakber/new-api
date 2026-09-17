import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { buildSettingsJSON, CHANNEL_FORM_DEFAULT_VALUES } from '../channel-form'

describe('channel field passthrough settings', () => {
  for (const [type, openai, claude] of [
    [1, true, false],
    [14, false, true],
    [57, true, false],
    [58, true, true],
    [59, true, true],
    [60, true, true],
    [61, true, false],
    [62, false, true],
    [63, true, false],
    [64, false, false],
  ] as const) {
    test(`persists only supported request fields for channel ${type}`, () => {
      for (const enabled of [false, true]) {
        const fields = {
          allow_service_tier: enabled,
          disable_store: enabled,
          allow_safety_identifier: enabled,
          allow_include_obfuscation: enabled,
          allow_inference_geo: enabled,
          allow_speed: enabled,
          claude_beta_query: enabled,
        }
        const settings = JSON.parse(
          buildSettingsJSON({
            ...CHANNEL_FORM_DEFAULT_VALUES,
            ...fields,
            type,
            settings: JSON.stringify({ ...fields, retained_option: 'keep' }),
          })
        ) as Record<string, unknown>
        const supported = {
          allow_service_tier: openai || claude,
          disable_store: openai,
          allow_safety_identifier: openai,
          allow_include_obfuscation: openai,
          allow_inference_geo: openai || claude,
          allow_speed: claude,
          claude_beta_query: type === 14,
        }
        for (const [field, allowed] of Object.entries(supported)) {
          assert.equal(settings[field], allowed ? enabled : undefined, field)
        }
        assert.equal(settings.retained_option, 'keep')
      }
    })
  }
})
