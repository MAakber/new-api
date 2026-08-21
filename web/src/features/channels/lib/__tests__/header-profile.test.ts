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
  HEADER_PROFILE_GROUPS,
  HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
  HEADER_PROFILE_ID_CODEX_COMPATIBLE,
  HEADER_PROFILE_LATEST_ALIAS,
  HEADER_PROFILE_PRESETS,
  baseHeaderProfileId,
  buildHeaderProfileId,
  buildHeaderProfileSnapshot,
  buildHeaderProfileUserAgent,
  headerProfileVersionFromId,
  isHeaderProfileStrategyConfigured,
  normalizeHeaderProfilePlatform,
  normalizeHeaderProfileVersion,
  resolveHeaderProfile,
  supportsHeaderProfilePlatform,
  supportsHeaderProfileVersioning,
  validateHeaderProfileStrategy,
} from '../header-profile'

describe('header profile ids', () => {
  test('splits versioned ids into base id and version', () => {
    assert.equal(baseHeaderProfileId('codex-cli@0.148.0'), 'codex-cli')
    assert.equal(headerProfileVersionFromId('codex-cli@0.148.0'), '0.148.0')
  })

  test('treats a bare id as tracking latest', () => {
    assert.equal(baseHeaderProfileId('codex-cli'), 'codex-cli')
    assert.equal(
      headerProfileVersionFromId('codex-cli'),
      HEADER_PROFILE_LATEST_ALIAS
    )
  })

  test('keeps the bare id for latest so the backend resolves the version', () => {
    assert.equal(buildHeaderProfileId('codex-cli', 'latest'), 'codex-cli')
    assert.equal(
      buildHeaderProfileId('codex-cli', '0.148.0'),
      'codex-cli@0.148.0'
    )
  })
})

describe('version and platform normalization', () => {
  test('falls back to latest for invalid versions', () => {
    assert.equal(normalizeHeaderProfileVersion(''), 'latest')
    assert.equal(normalizeHeaderProfileVersion('not-a-version'), 'latest')
    assert.equal(normalizeHeaderProfileVersion('1.2.3'), '1.2.3')
  })

  test('falls back to the default platform for unknown values', () => {
    assert.equal(normalizeHeaderProfilePlatform('linux-arm64'), 'linux-arm64')
    assert.equal(normalizeHeaderProfilePlatform('solaris-sparc'), 'macos-x64')
    assert.equal(normalizeHeaderProfilePlatform(undefined), 'macos-x64')
  })
})

describe('user agent generation', () => {
  test('builds platform-aware CLI user agents', () => {
    assert.equal(
      buildHeaderProfileUserAgent('codex-cli', '0.148.0', 'macos-x64'),
      'codex-tui/0.148.0 (Mac OS 15.7.3; x86_64) ghostty/1.3.1 (codex-tui; 0.148.0)'
    )
    assert.equal(
      buildHeaderProfileUserAgent('qwen-code', '0.21.14', 'linux-arm64'),
      'QwenCode/0.21.14 (linux; arm64)'
    )
  })

  test('returns an empty string for templates without a UA formula', () => {
    assert.equal(buildHeaderProfileUserAgent('chrome-macos', '1.0.0'), '')
  })
})

describe('snapshots', () => {
  test('rebuilds the user agent for a pinned version', () => {
    const snapshot = buildHeaderProfileSnapshot(
      'codex-cli',
      '0.148.0',
      'macos-arm64'
    )
    assert.equal(snapshot?.id, 'codex-cli@0.148.0')
    assert.ok(snapshot?.headers['User-Agent'].includes('codex-tui/0.148.0'))
    assert.ok(snapshot?.headers['User-Agent'].includes('aarch64'))
    assert.equal(snapshot?.version_meta?.platform, 'macos-arm64')
    // Static identity headers must survive the rebuild.
    assert.equal(snapshot?.headers.Originator, 'codex-tui')
  })

  test('keeps the fallback user agent when tracking latest', () => {
    const snapshot = buildHeaderProfileSnapshot(
      'codex-cli',
      'latest',
      'macos-x64'
    )
    assert.equal(snapshot?.id, 'codex-cli')
    assert.equal(snapshot?.version_meta?.version, 'latest')
  })

  test('does not mutate the shared preset headers', () => {
    const before = HEADER_PROFILE_PRESETS['codex-cli'].headers['User-Agent']
    buildHeaderProfileSnapshot('codex-cli', '9.9.9', 'linux-x64')
    assert.equal(
      HEADER_PROFILE_PRESETS['codex-cli'].headers['User-Agent'],
      before
    )
  })

  test('returns null for an unknown template', () => {
    assert.equal(
      buildHeaderProfileSnapshot('does-not-exist', 'latest', ''),
      null
    )
  })
})

describe('resolution', () => {
  test('prefers custom profiles over presets', () => {
    const custom = {
      id: 'chrome-macos',
      name: 'my override',
      headers: { 'User-Agent': 'custom' },
    }
    assert.equal(
      resolveHeaderProfile('chrome-macos', [custom])?.name,
      'my override'
    )
  })

  test('resolves versioned built-in ids', () => {
    assert.equal(
      resolveHeaderProfile('codex-cli@0.148.0')?.id,
      'codex-cli@0.148.0'
    )
  })

  test('returns undefined for unknown ids', () => {
    assert.equal(resolveHeaderProfile('nope'), undefined)
    assert.equal(resolveHeaderProfile(''), undefined)
  })
})

describe('versioning support', () => {
  test('only npm-backed CLI templates are versioned', () => {
    assert.equal(supportsHeaderProfileVersioning('codex-cli'), true)
    assert.equal(supportsHeaderProfileVersioning('claude-code'), true)
    assert.equal(supportsHeaderProfileVersioning('chrome-macos'), false)
    assert.equal(supportsHeaderProfileVersioning('codex-desktop'), false)
  })
})

describe('strategy validation', () => {
  test('ignores a disabled strategy', () => {
    assert.equal(
      validateHeaderProfileStrategy({
        enabled: false,
        mode: 'fixed',
        selected_profile_ids: [],
      }),
      null
    )
  })

  test('requires exactly one template in fixed mode', () => {
    assert.ok(
      validateHeaderProfileStrategy({
        enabled: true,
        mode: 'fixed',
        selected_profile_ids: [],
      })
    )
    assert.ok(
      validateHeaderProfileStrategy({
        enabled: true,
        mode: 'fixed',
        selected_profile_ids: ['a', 'b'],
      })
    )
    assert.equal(
      validateHeaderProfileStrategy({
        enabled: true,
        mode: 'fixed',
        selected_profile_ids: ['a'],
      }),
      null
    )
  })

  test('allows multiple templates in rotation modes', () => {
    assert.equal(
      validateHeaderProfileStrategy({
        enabled: true,
        mode: 'round_robin',
        selected_profile_ids: ['a', 'b'],
      }),
      null
    )
    assert.ok(
      validateHeaderProfileStrategy({
        enabled: true,
        mode: 'random',
        selected_profile_ids: [],
      })
    )
  })

  test('reports configured only when enabled with a selection', () => {
    assert.equal(
      isHeaderProfileStrategyConfigured({
        enabled: true,
        mode: 'fixed',
        selected_profile_ids: ['codex-cli'],
      }),
      true
    )
    assert.equal(
      isHeaderProfileStrategyConfigured({
        enabled: true,
        mode: 'fixed',
        selected_profile_ids: [],
      }),
      false
    )
    assert.equal(isHeaderProfileStrategyConfigured(null), false)
  })
})

describe('template grouping', () => {
  test('exposes exactly the dynamic, static and custom groups', () => {
    assert.deepEqual(
      HEADER_PROFILE_GROUPS.map((group) => group.key),
      ['dynamic', 'static', 'custom']
    )
  })

  test('every preset belongs to the dynamic or static group', () => {
    for (const preset of Object.values(HEADER_PROFILE_PRESETS)) {
      assert.ok(
        preset.category === 'dynamic' || preset.category === 'static',
        `${preset.id} has unexpected category ${preset.category}`
      )
    }
  })

  test('the static group holds the four kept client templates', () => {
    const staticIds = Object.values(HEADER_PROFILE_PRESETS)
      .filter((preset) => preset.category === 'static')
      .map((preset) => preset.id)
      .sort()
    assert.deepEqual(staticIds, [
      'chrome-macos',
      'claude-code',
      'codex-cli',
      'codex-desktop',
      'gemini-cli',
    ])
  })

  test('removed templates are gone', () => {
    for (const id of ['qwen-code', 'droid', 'agy', 'postman-runtime']) {
      assert.equal(HEADER_PROFILE_PRESETS[id], undefined, id)
      assert.equal(resolveHeaderProfile(id), undefined, id)
    }
  })
})

describe('dynamic (protocol compatible) templates', () => {
  test('both dynamic templates require pass_headers', () => {
    for (const id of [
      HEADER_PROFILE_ID_CODEX_COMPATIBLE,
      HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
    ]) {
      const preset = HEADER_PROFILE_PRESETS[id]
      assert.equal(preset.category, 'dynamic', id)
      assert.equal(preset.passthrough_required, true, id)
      assert.ok(preset.description?.includes('pass_headers'), id)
    }
  })

  test('dynamic templates never carry credentials or transport headers', () => {
    for (const id of [
      HEADER_PROFILE_ID_CODEX_COMPATIBLE,
      HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
    ]) {
      const headers = HEADER_PROFILE_PRESETS[id].headers
      assert.equal(headers.Authorization, undefined, id)
      assert.equal(headers['X-Api-Key'], undefined, id)
      assert.equal(headers.Accept, undefined, id)
      assert.equal(headers['Content-Type'], undefined, id)
    }
  })

  test('codex compatible pins the Responses API protocol markers', () => {
    const headers = HEADER_PROFILE_PRESETS[HEADER_PROFILE_ID_CODEX_COMPATIBLE].headers
    assert.equal(headers['OpenAI-Beta'], 'responses=experimental')
    assert.equal(headers.Originator, 'codex_cli_rs')
    assert.ok(headers['User-Agent'].startsWith('codex_cli_rs/'))
  })

  test('claude code compatible pins the Anthropic protocol markers', () => {
    const headers =
      HEADER_PROFILE_PRESETS[HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE].headers
    assert.equal(headers['Anthropic-Version'], '2023-06-01')
    assert.ok(headers['User-Agent'].startsWith('claude-cli/'))
  })

  test('dynamic templates track the npm release of their CLI counterpart', () => {
    const packages: Record<string, string> = {
      [HEADER_PROFILE_ID_CODEX_COMPATIBLE]: '@openai/codex',
      [HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE]: '@anthropic-ai/claude-code',
    }
    for (const [id, packageName] of Object.entries(packages)) {
      assert.equal(supportsHeaderProfileVersioning(id), true, id)
      assert.equal(
        HEADER_PROFILE_PRESETS[id].version_meta?.package_name,
        packageName,
        id
      )
      assert.equal(
        HEADER_PROFILE_PRESETS[id].version_meta?.version,
        'latest',
        id
      )
    }
  })

  test('dynamic templates offer a platform choice and persist it in snapshots', () => {
    for (const id of [
      HEADER_PROFILE_ID_CODEX_COMPATIBLE,
      HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
    ]) {
      assert.equal(supportsHeaderProfilePlatform(id), true, id)
      const snapshot = buildHeaderProfileSnapshot(id, '1.2.3', 'linux-arm64')
      assert.equal(snapshot?.version_meta?.platform, 'linux-arm64', id)
    }
    assert.equal(supportsHeaderProfilePlatform('codex-cli'), true)
  })

  test('dynamic templates keep their own user agent shape', () => {
    assert.equal(
      buildHeaderProfileUserAgent(HEADER_PROFILE_ID_CODEX_COMPATIBLE, '0.200.0'),
      'codex_cli_rs/0.200.0'
    )
    assert.equal(
      buildHeaderProfileUserAgent(
        HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
        '2.2.5'
      ),
      'claude-cli/2.2.5 (external, cli)'
    )
    // The CLI template shares the npm package but has a different UA shape.
    assert.notEqual(
      buildHeaderProfileUserAgent('codex-cli', '0.200.0'),
      buildHeaderProfileUserAgent(HEADER_PROFILE_ID_CODEX_COMPATIBLE, '0.200.0')
    )
  })

  test('pinning a version rebuilds the dynamic user agent', () => {
    const snapshot = buildHeaderProfileSnapshot(
      HEADER_PROFILE_ID_CODEX_COMPATIBLE,
      '0.200.0',
      'macos-x64'
    )
    assert.equal(snapshot?.id, `${HEADER_PROFILE_ID_CODEX_COMPATIBLE}@0.200.0`)
    assert.equal(snapshot?.headers['User-Agent'], 'codex_cli_rs/0.200.0')
    // Protocol markers must survive the rebuild.
    assert.equal(snapshot?.headers['OpenAI-Beta'], 'responses=experimental')
    assert.equal(snapshot?.headers.Originator, 'codex_cli_rs')
  })
})
