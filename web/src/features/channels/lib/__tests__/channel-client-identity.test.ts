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

import type { Channel } from '../../types'
import {
  CHANNEL_FORM_DEFAULT_VALUES,
  buildSettingsJSON,
  getClientIdentitySourceForProfile,
  transformChannelToFormDefaults,
} from '../channel-form'

describe('channel client identity settings', () => {
  test('writes distinct Codex profiles with their official source', () => {
    const legacy = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 57,
        settings: JSON.stringify({ disable_store: true }),
        disable_store: true,
      })
    )
    const compatible = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 61,
        client_identity_version: '1.2.3',
        client_identity_platform: 'linux-x64',
      })
    )

    assert.equal(legacy.client_identity.profile, 'codex_legacy')
    assert.deepEqual(legacy.client_identity.source, { kind: 'official' })
    assert.equal(legacy.disable_store, true)
    assert.equal(compatible.client_identity.profile, 'codex_compatibility')
    assert.equal(compatible.client_identity.version, '1.2.3')
    assert.equal(compatible.client_identity.platform, 'linux-x64')
    assert.deepEqual(compatible.client_identity.source, { kind: 'official' })
  })

  test('removes client identity when a channel changes to an unrelated type', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 1,
        settings: JSON.stringify({
          client_identity: { profile: 'codex_legacy', version: '1.2.3' },
          disable_store: true,
        }),
        disable_store: true,
      })
    )

    assert.equal(settings.client_identity, undefined)
    assert.equal(settings.disable_store, true)
  })

  test('serializes a lightweight Codex identity with an automatic official source', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 1,
        client_identity_client_type: 'codex',
        client_identity_profile: 'codex_cli',
        client_identity_version: '0.147.0',
        client_identity_platform: 'linux-x64',
        client_identity_source: 'community',
      })
    )

    assert.deepEqual(settings.client_identity, {
      client_type: 'codex',
      profile: 'codex_cli',
      version: '0.147.0',
      platform: 'linux-x64',
      source: { kind: 'official' },
    })
  })

  test('maps client identity sources independently of legacy form source', () => {
    assert.equal(getClientIdentitySourceForProfile('codex_cli'), 'official')
  })

  test('serializes a Claude Code profile with an automatic official source', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 62,
        client_identity_source: 'community',
      })
    )

    assert.deepEqual(settings.client_identity.source, { kind: 'official' })
  })

  test('serializes the Claude Code 1M context flag when enabled', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 62,
        client_identity_context_1m_enabled: true,
      })
    )

    assert.equal(settings.client_identity.context_1m_enabled, true)
  })

  test('reads the persisted Claude Code 1M context flag', () => {
    const values = transformChannelToFormDefaults({
      type: 62,
      settings: JSON.stringify({
        client_identity: {
          client_type: 'claude_code',
          profile: 'claude_code',
          context_1m_enabled: true,
        },
      }),
      channel_info: {
        is_multi_key: false,
        multi_key_size: 0,
        multi_key_polling_index: 0,
        multi_key_mode: 'random',
      },
    } as Channel)

    assert.equal(values.client_identity_context_1m_enabled, true)
  })

  test('does not serialize the Claude Code 1M context flag when disabled', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 62,
        settings: JSON.stringify({
          client_identity: {
            profile: 'claude_code',
            context_1m_enabled: true,
          },
        }),
        client_identity_context_1m_enabled: false,
      })
    )

    assert.equal(settings.client_identity.context_1m_enabled, undefined)
  })

  // The persisted source is always derived from the profile, so a stale legacy
  // form value must never be written through.
  test('ignores the legacy form source when serializing a profile', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 1,
        client_identity_client_type: 'codex',
        client_identity_profile: 'codex_cli',
        client_identity_version: '2.115.0',
        client_identity_source: 'community',
      })
    )

    assert.deepEqual(settings.client_identity.source, {
      kind: getClientIdentitySourceForProfile('codex_cli'),
    })
    assert.notEqual(settings.client_identity.source.kind, 'community')
  })

  test('keeps standard channels on no-client defaults without identity settings', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 14,
      })
    )

    assert.equal(settings.client_identity, undefined)
  })

  test('does not serialize a deep profile onto a standard channel', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 1,
        client_identity_client_type: 'codex',
        client_identity_profile: 'codex_legacy',
        client_identity_version: '0.147.0',
      })
    )

    assert.equal(settings.client_identity, undefined)
  })

  test('falls back to the deep channel template after a type switch', () => {
    const settings = JSON.parse(
      buildSettingsJSON({
        ...CHANNEL_FORM_DEFAULT_VALUES,
        type: 61,
        client_identity_client_type: 'codex',
        client_identity_profile: 'codex_cli',
        client_identity_version: '0.147.0',
      })
    )

    assert.equal(settings.client_identity.client_type, 'codex')
    assert.equal(settings.client_identity.profile, 'codex_compatibility')
    assert.equal(settings.client_identity.version, undefined)
  })
})
