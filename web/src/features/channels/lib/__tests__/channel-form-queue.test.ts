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

import { buildSettingJSON, CHANNEL_FORM_DEFAULT_VALUES } from '../channel-form'

describe('channel queue setting serialization', () => {
  test('keeps an existing queue configuration when the enabled switch is turned off', () => {
    const formData = {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      setting: JSON.stringify({
        queue: {
          enabled: true,
          model: 'legacy-model',
          interval: 45,
          endpoint_type: 'legacy-endpoint',
          warmup_message: 'legacy message',
          max_tokens: 32,
          timeout: 40,
          circuit_breaker_enabled: false,
          max_consecutive_failures: 3,
          cooldown_seconds: 90,
          max_queue_attempts: 2,
          backoff_seconds: 10,
          queue_busy_status_codes: [408, 503],
          future_option: 'preserve this',
        },
      }),
      queue_enabled: false,
      queue_model: 'current-model',
      queue_interval: 60,
      queue_endpoint_type: 'current-endpoint',
      queue_warmup_message: 'current message',
      queue_max_tokens: 64,
      queue_timeout: 50,
      queue_circuit_breaker_enabled: true,
      queue_max_consecutive_failures: 4,
      queue_cooldown_seconds: 100,
      queue_max_queue_attempts: 3,
      queue_backoff_seconds: 20,
      queue_busy_status_codes: '429, 503',
    }

    const setting = JSON.parse(buildSettingJSON(formData))

    assert.deepEqual(setting.queue, {
      enabled: false,
      model: 'current-model',
      interval: 60,
      endpoint_type: 'current-endpoint',
      warmup_message: 'current message',
      max_tokens: 64,
      timeout: 50,
      circuit_breaker_enabled: true,
      max_consecutive_failures: 4,
      cooldown_seconds: 100,
      max_queue_attempts: 3,
      backoff_seconds: 20,
      queue_busy_status_codes: [429, 503],
      future_option: 'preserve this',
    })
  })

  test('uses current form values when an existing queue is enabled again', () => {
    const formData = {
      ...CHANNEL_FORM_DEFAULT_VALUES,
      setting: JSON.stringify({
        queue: {
          enabled: false,
          model: 'old-model',
          future_option: 'preserve this',
        },
      }),
      queue_enabled: true,
      queue_model: 'current-model',
      queue_interval: 60,
    }

    const setting = JSON.parse(buildSettingJSON(formData))

    assert.equal(setting.queue.enabled, true)
    assert.equal(setting.queue.model, 'current-model')
    assert.equal(setting.queue.interval, 60)
    assert.equal(setting.queue.future_option, 'preserve this')
  })

  test('omits queue when a channel has no existing queue and the switch is off', () => {
    const setting = JSON.parse(
      buildSettingJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        setting: '{}',
        queue_enabled: false,
      })
    )

    assert.equal('queue' in setting, false)
  })

  test('does not throw when the existing setting is malformed', () => {
    assert.doesNotThrow(() =>
      buildSettingJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        setting: '{malformed',
        queue_enabled: false,
      })
    )
  })
})
