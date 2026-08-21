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

/**
 * Upstream request header profiles ("client templates").
 *
 * A channel can pin the client identity it presents upstream by selecting one
 * or more header templates. The backend resolves the selection at request time
 * (fixed / round robin / random) and applies the resulting headers.
 *
 * The built-in template snapshots here mirror the backend defaults in
 * relaykit/dto/header_profile.go. For npm-backed CLI templates the User-Agent
 * is regenerated from the selected version/platform, and `latest` is resolved
 * server-side from the cached npm registry data.
 */

/**
 * Template groups.
 *
 * `dynamic` templates present an official client identity together with the
 * upstream protocol markers. Their per-request dynamic headers (session ids,
 * trace ids) are produced by the relay, so pass_headers is mandatory.
 * `static` templates only pin the client identity headers.
 */
export type HeaderProfileCategory = 'dynamic' | 'static' | 'custom'

export type HeaderProfileScope = 'builtin' | 'user'

export type HeaderProfileMode = 'fixed' | 'round_robin' | 'random'

export type HeaderProfilePlatform =
  | 'macos-x64'
  | 'macos-arm64'
  | 'linux-x64'
  | 'linux-arm64'
  | 'windows-x64'
  | 'windows-arm64'

export type HeaderProfileVersionMeta = {
  base_profile_id?: string
  package_name?: string
  source?: string
  version?: string
  platform?: string
}

export type HeaderProfile = {
  id: string
  name: string
  category?: HeaderProfileCategory
  scope?: HeaderProfileScope
  headers: Record<string, string>
  readonly?: boolean
  description?: string
  passthrough_required?: boolean
  version_meta?: HeaderProfileVersionMeta
}

export type HeaderProfileStrategy = {
  enabled: boolean
  mode: HeaderProfileMode
  selected_profile_ids: string[]
  profiles?: HeaderProfile[]
}

export const HEADER_PROFILE_LATEST_ALIAS = 'latest'
export const HEADER_PROFILE_DEFAULT_PLATFORM: HeaderProfilePlatform =
  'macos-x64'
export const NPM_VERSION_OPTION_LIMIT = 5

export const HEADER_PROFILE_GROUPS: Array<{
  key: HeaderProfileCategory
  labelKey: string
}> = [
  { key: 'dynamic', labelKey: 'Dynamic (protocol compatible)' },
  { key: 'static', labelKey: 'Static (client identity only)' },
  { key: 'custom', labelKey: 'Custom' },
]

/** Protocol-compatible template ids, mirrored from the backend. */
export const HEADER_PROFILE_ID_CODEX_COMPATIBLE = 'codex-compatible'
export const HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE =
  'claude-code-compatible'

type PlatformTokens = {
  value: HeaderProfilePlatform
  label: string
  codexOS: string
  codexArch: string
  geminiOS: string
  geminiArch: string
  qwenOS: string
  qwenArch: string
}

export const HEADER_PROFILE_PLATFORM_OPTIONS: PlatformTokens[] = [
  {
    value: 'macos-x64',
    label: 'macOS x64',
    codexOS: 'Mac OS 15.7.3',
    codexArch: 'x86_64',
    geminiOS: 'darwin',
    geminiArch: 'x64',
    qwenOS: 'darwin',
    qwenArch: 'x64',
  },
  {
    value: 'macos-arm64',
    label: 'macOS arm64',
    codexOS: 'Mac OS 15.7.3',
    codexArch: 'aarch64',
    geminiOS: 'darwin',
    geminiArch: 'arm64',
    qwenOS: 'darwin',
    qwenArch: 'arm64',
  },
  {
    value: 'linux-x64',
    label: 'Linux x64',
    codexOS: 'Linux',
    codexArch: 'x86_64',
    geminiOS: 'linux',
    geminiArch: 'x64',
    qwenOS: 'linux',
    qwenArch: 'x64',
  },
  {
    value: 'linux-arm64',
    label: 'Linux arm64',
    codexOS: 'Linux',
    codexArch: 'aarch64',
    geminiOS: 'linux',
    geminiArch: 'arm64',
    qwenOS: 'linux',
    qwenArch: 'arm64',
  },
  {
    value: 'windows-x64',
    label: 'Windows x64',
    codexOS: 'Windows NT 10.0',
    codexArch: 'x86_64',
    geminiOS: 'win32',
    geminiArch: 'x64',
    qwenOS: 'win32',
    qwenArch: 'x64',
  },
  {
    value: 'windows-arm64',
    label: 'Windows arm64',
    codexOS: 'Windows NT 10.0',
    codexArch: 'aarch64',
    geminiOS: 'win32',
    geminiArch: 'arm64',
    qwenOS: 'win32',
    qwenArch: 'arm64',
  },
]

/** npm packages backing the auto-versioned CLI templates. */
export const HEADER_PROFILE_VERSION_SOURCES: Record<
  string,
  { packageName: string; fallbackVersion: string }
> = {
  'codex-cli': { packageName: '@openai/codex', fallbackVersion: '0.142.4' },
  'claude-code': {
    packageName: '@anthropic-ai/claude-code',
    fallbackVersion: '2.1.197',
  },
  'gemini-cli': {
    packageName: '@google/gemini-cli',
    fallbackVersion: '0.49.0',
  },
  // The protocol-compatible templates share the npm packages of their CLI
  // counterparts, so their versions track upstream releases too.
  [HEADER_PROFILE_ID_CODEX_COMPATIBLE]: {
    packageName: '@openai/codex',
    fallbackVersion: '0.146.0',
  },
  [HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE]: {
    packageName: '@anthropic-ai/claude-code',
    fallbackVersion: '2.1.214',
  },
}

export function normalizeHeaderProfilePlatform(
  platform: string | undefined
): HeaderProfilePlatform {
  const normalized = String(platform ?? '').trim()
  const match = HEADER_PROFILE_PLATFORM_OPTIONS.find(
    (option) => option.value === normalized
  )
  return match ? match.value : HEADER_PROFILE_DEFAULT_PLATFORM
}

function getPlatformTokens(platform: string | undefined): PlatformTokens {
  const normalized = normalizeHeaderProfilePlatform(platform)
  return (
    HEADER_PROFILE_PLATFORM_OPTIONS.find(
      (option) => option.value === normalized
    ) ?? HEADER_PROFILE_PLATFORM_OPTIONS[0]
  )
}

/**
 * Rebuilds a CLI User-Agent for the given version/platform. Must stay in sync
 * with buildAICodingCLIUserAgent in relaykit/dto/header_profile_version.go.
 */
export function buildHeaderProfileUserAgent(
  profileId: string,
  version: string,
  platform: string = HEADER_PROFILE_DEFAULT_PLATFORM
): string {
  const tokens = getPlatformTokens(platform)
  switch (profileId) {
    case 'codex-cli':
      return `codex-tui/${version} (${tokens.codexOS}; ${tokens.codexArch}) ghostty/1.3.1 (codex-tui; ${version})`
    case 'claude-code':
      return `claude-cli/${version} (external, sdk-cli)`
    case 'gemini-cli':
      return `GeminiCLI/${version}/gemini-3.1-pro-preview (${tokens.geminiOS}; ${tokens.geminiArch}; terminal)`
    case 'qwen-code':
      return `QwenCode/${version} (${tokens.qwenOS}; ${tokens.qwenArch})`
    case 'droid':
      return `factory-cli/${version}`
    // Dynamic templates keep their own UA shape, which differs from the CLI
    // template that shares the same npm package.
    case HEADER_PROFILE_ID_CODEX_COMPATIBLE:
      return `codex_cli_rs/${version}`
    case HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE:
      return `claude-cli/${version} (external, cli)`
    default:
      return ''
  }
}

function buildCliHeaders(
  profileId: string,
  version: string,
  extraHeaders: Record<string, string> = {},
  platform: string = HEADER_PROFILE_DEFAULT_PLATFORM
): Record<string, string> {
  return {
    ...extraHeaders,
    'User-Agent': buildHeaderProfileUserAgent(profileId, version, platform),
  }
}

function buildCliProfile(
  id: string,
  name: string,
  headers: Record<string, string>,
  description: string,
  hasVersionSource: boolean,
  passthroughRequired = false
): HeaderProfile {
  const profile: HeaderProfile = {
    id,
    name,
    category: 'static',
    scope: 'builtin',
    readonly: true,
    passthrough_required: passthroughRequired,
    description,
    headers,
  }
  if (hasVersionSource) {
    const source = HEADER_PROFILE_VERSION_SOURCES[id]
    profile.version_meta = {
      base_profile_id: id,
      package_name: source.packageName,
      source: 'npm',
      version: HEADER_PROFILE_LATEST_ALIAS,
      platform: HEADER_PROFILE_DEFAULT_PLATFORM,
    }
  }
  return profile
}

/**
 * Built-in template snapshots. These mirror BuiltinHeaderProfiles on the
 * backend so the UI can preview headers without a round trip.
 */
export const HEADER_PROFILE_PRESETS: Record<string, HeaderProfile> = {
  // ── Dynamic (protocol compatible) ──
  // These replace the header injection that used to be bound to the Codex /
  // Claude Code channel types, so any channel can present that identity.
  [HEADER_PROFILE_ID_CODEX_COMPATIBLE]: {
    id: HEADER_PROFILE_ID_CODEX_COMPATIBLE,
    name: 'Codex 兼容',
    category: 'dynamic',
    scope: 'builtin',
    readonly: true,
    passthrough_required: true,
    description:
      '以 Codex 官方客户端身份访问上游，附带 Responses API 协议标记。版本默认跟随 @openai/codex 的 npm latest。会话、窗口与 turn metadata 等动态请求头必须在高级请求规则中配置 pass_headers 才会透传。',
    headers: {
      'User-Agent': 'codex_cli_rs/0.146.0',
      Originator: 'codex_cli_rs',
      'OpenAI-Beta': 'responses=experimental',
    },
    version_meta: {
      base_profile_id: HEADER_PROFILE_ID_CODEX_COMPATIBLE,
      package_name: '@openai/codex',
      source: 'npm',
      version: HEADER_PROFILE_LATEST_ALIAS,
      platform: HEADER_PROFILE_DEFAULT_PLATFORM,
    },
  },
  [HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE]: {
    id: HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
    name: 'Claude Code 兼容',
    category: 'dynamic',
    scope: 'builtin',
    readonly: true,
    passthrough_required: true,
    description:
      '以 Claude Code 官方客户端身份访问上游，附带 Anthropic 协议标记。版本默认跟随 @anthropic-ai/claude-code 的 npm latest。X-Claude-Code-Session-Id、X-Stainless-* 等动态请求头必须在高级请求规则中配置 pass_headers 才会透传。',
    headers: {
      'User-Agent': 'claude-cli/2.1.214 (external, cli)',
      'Anthropic-Beta': 'claude-code-20250219',
      'Anthropic-Version': '2023-06-01',
    },
    version_meta: {
      base_profile_id: HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE,
      package_name: '@anthropic-ai/claude-code',
      source: 'npm',
      version: HEADER_PROFILE_LATEST_ALIAS,
      platform: HEADER_PROFILE_DEFAULT_PLATFORM,
    },
  },
  // ── Static (client identity only) ──
  'chrome-macos': {
    id: 'chrome-macos',
    name: 'Chrome macOS',
    category: 'static',
    scope: 'builtin',
    readonly: true,
    description: '适合要求浏览器访问特征的上游',
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-CH-UA':
        '"Google Chrome";v="150", "Chromium";v="150", "Not.A/Brand";v="24"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"macOS"',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.7871.47 Safari/537.36',
    },
  },
  'codex-cli': buildCliProfile(
    'codex-cli',
    'Codex CLI',
    buildCliHeaders('codex-cli', '0.142.4', { Originator: 'codex-tui' }),
    '默认使用 Codex CLI npm latest 版本套用交互式 TUI 请求头生成逻辑；清单暂不可用时保留内置快照。此模板仅固定客户端身份。会话、窗口与 turn metadata 动态头需在高级参数覆盖中显式选择 Codex CLI 请求头透传模板。',
    true
  ),
  'codex-desktop': buildCliProfile(
    'codex-desktop',
    'Codex Desktop',
    {
      'User-Agent':
        'Codex Desktop/0.142.4 (Mac OS 15.7.3; x86_64) unknown (Codex Desktop; 26.623.70822)',
      Originator: 'Codex Desktop',
    },
    '固定请求头静态快照来自本机 Codex Desktop 原始请求抓包。此模板仅固定 Codex App 客户端身份，不能与 codex-tui 混用。会话、窗口与 turn metadata 动态头需在高级参数覆盖中显式选择 Codex Desktop 请求头透传模板。',
    false
  ),
  'claude-code': buildCliProfile(
    'claude-code',
    'Claude Code',
    buildCliHeaders('claude-code', '2.1.197'),
    '默认使用 Claude Code npm latest 版本套用既有客户端 UA 格式；清单暂不可用时保留内置快照。此模板仅固定客户端身份。X-Claude-Code-Session-Id、Anthropic-Version、Anthropic-Beta、X-Stainless-* 等动态头需在高级参数覆盖中显式选择 Claude Code 请求头透传模板。',
    true
  ),
  'gemini-cli': buildCliProfile(
    'gemini-cli',
    'Gemini CLI',
    buildCliHeaders('gemini-cli', '0.49.0'),
    '默认使用 Gemini CLI npm latest 版本套用既有客户端 UA 格式；清单暂不可用时保留内置快照。此模板仅固定客户端身份。x-goog-api-client 等动态头需在高级参数覆盖中显式选择 Gemini CLI 请求头透传模板。',
    true
  ),

}

export function getHeaderProfileVersionSource(profileId: string) {
  return HEADER_PROFILE_VERSION_SOURCES[baseHeaderProfileId(profileId)]
}

export function supportsHeaderProfileVersioning(profileId: string): boolean {
  return Boolean(getHeaderProfileVersionSource(profileId))
}

/**
 * The dynamic templates' user agents carry no OS/arch tokens, so offering a
 * platform choice for them would be misleading.
 */
export function supportsHeaderProfilePlatform(profileId: string): boolean {
  const baseId = baseHeaderProfileId(profileId)
  // Both protocol-compatible templates expose the same version/platform
  // controls as the static CLI templates. The platform is persisted in the
  // snapshot for client selection consistency; the official compatible UA
  // format currently does not encode OS/arch, so it is not injected into UA.
  if (
    baseId === HEADER_PROFILE_ID_CODEX_COMPATIBLE ||
    baseId === HEADER_PROFILE_ID_CLAUDE_CODE_COMPATIBLE
  ) {
    return true
  }
  return supportsHeaderProfileVersioning(baseId)
}

/** `codex-cli@0.148.0` -> `codex-cli` */
export function baseHeaderProfileId(profileId: string): string {
  const trimmed = String(profileId ?? '').trim()
  const separatorIndex = trimmed.indexOf('@')
  return separatorIndex > 0 ? trimmed.slice(0, separatorIndex) : trimmed
}

/** `codex-cli@0.148.0` -> `0.148.0`, plain ids default to `latest`. */
export function headerProfileVersionFromId(profileId: string): string {
  const trimmed = String(profileId ?? '').trim()
  const separatorIndex = trimmed.indexOf('@')
  if (separatorIndex <= 0) return HEADER_PROFILE_LATEST_ALIAS
  return trimmed.slice(separatorIndex + 1) || HEADER_PROFILE_LATEST_ALIAS
}

export function normalizeHeaderProfileVersion(version: string): string {
  const normalized = String(version ?? '').trim()
  if (!normalized || normalized === HEADER_PROFILE_LATEST_ALIAS) {
    return HEADER_PROFILE_LATEST_ALIAS
  }
  if (normalized.length > 64 || !/^[0-9][0-9A-Za-z.+-]*$/.test(normalized)) {
    return HEADER_PROFILE_LATEST_ALIAS
  }
  return normalized
}

/**
 * Builds the profile id stored in the strategy. `latest` keeps the bare id so
 * the backend can resolve the newest npm version at request time.
 */
export function buildHeaderProfileId(
  baseProfileId: string,
  version: string
): string {
  const normalizedVersion = normalizeHeaderProfileVersion(version)
  if (normalizedVersion === HEADER_PROFILE_LATEST_ALIAS) return baseProfileId
  return `${baseProfileId}@${normalizedVersion}`
}

/**
 * Builds the snapshot persisted alongside a selection so the channel keeps
 * working even if the preset list changes later.
 */
export function buildHeaderProfileSnapshot(
  baseProfileId: string,
  version: string,
  platform: string
): HeaderProfile | null {
  const preset = HEADER_PROFILE_PRESETS[baseProfileId]
  if (!preset) return null

  const normalizedVersion = normalizeHeaderProfileVersion(version)
  const normalizedPlatform = normalizeHeaderProfilePlatform(platform)
  const profileId = buildHeaderProfileId(baseProfileId, normalizedVersion)

  const snapshot: HeaderProfile = {
    ...preset,
    id: profileId,
    headers: { ...preset.headers },
  }

  if (preset.version_meta) {
    snapshot.version_meta = {
      ...preset.version_meta,
      version: normalizedVersion,
      platform: normalizedPlatform,
    }
    // For a pinned version the UA is rebuilt locally; `latest` is resolved
    // server-side so the stored snapshot keeps the fallback UA.
    if (normalizedVersion !== HEADER_PROFILE_LATEST_ALIAS) {
      const userAgent = buildHeaderProfileUserAgent(
        baseProfileId,
        normalizedVersion,
        normalizedPlatform
      )
      if (userAgent) snapshot.headers['User-Agent'] = userAgent
    }
    snapshot.name = `${preset.name} ${normalizedVersion}`.trim()
  }

  return snapshot
}

export function resolveHeaderProfile(
  profileId: string,
  customProfiles: HeaderProfile[] = []
): HeaderProfile | undefined {
  const trimmed = String(profileId ?? '').trim()
  if (!trimmed) return undefined

  const custom = customProfiles.find((profile) => profile.id === trimmed)
  if (custom) return custom

  const preset = HEADER_PROFILE_PRESETS[trimmed]
  if (preset) return preset

  const baseId = baseHeaderProfileId(trimmed)
  if (baseId !== trimmed && HEADER_PROFILE_PRESETS[baseId]) {
    return buildHeaderProfileSnapshot(
      baseId,
      headerProfileVersionFromId(trimmed),
      HEADER_PROFILE_DEFAULT_PLATFORM
    ) ?? undefined
  }
  return undefined
}

export function createEmptyHeaderProfileStrategy(): HeaderProfileStrategy {
  return { enabled: false, mode: 'fixed', selected_profile_ids: [] }
}

export function isHeaderProfileStrategyConfigured(
  strategy: HeaderProfileStrategy | null | undefined
): boolean {
  return Boolean(
    strategy?.enabled && (strategy.selected_profile_ids?.length ?? 0) > 0
  )
}

/**
 * Fixed mode allows exactly one template; rotation modes allow many. Returns a
 * human-readable reason when the selection is not valid so the UI can block
 * saving with an explanation.
 */
export function validateHeaderProfileStrategy(
  strategy: HeaderProfileStrategy | null | undefined
): string | null {
  if (!strategy?.enabled) return null
  const count = strategy.selected_profile_ids?.length ?? 0
  if (strategy.mode === 'fixed' && count !== 1) {
    return 'Fixed mode requires exactly one template'
  }
  if (strategy.mode !== 'fixed' && count < 1) {
    return 'Select at least one template'
  }
  return null
}

// ---------------------------------------------------------------------------
// Custom template drafts
// ---------------------------------------------------------------------------

/** Header names a custom template must never set. Mirrors the backend filter. */
const UNSAFE_CUSTOM_HEADER_NAMES = new Set([
  'accept-encoding',
  'authorization',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'origin',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cf-connecting-ip',
  'forwarded',
  'x-api-key',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-goog-api-key',
  'x-real-ip',
])

export function isUnsafeCustomHeaderName(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  if (normalized.startsWith('sec-fetch-')) return true
  return UNSAFE_CUSTOM_HEADER_NAMES.has(normalized)
}

export type HeaderProfileDraft = {
  id?: string
  name: string
  headersText: string
  description?: string
}

export type HeaderProfileDraftValidation = {
  isValid: boolean
  /**
   * Error messages are i18n keys so the dialog can translate them. The unsafe
   * header case carries the offending names separately for interpolation.
   */
  errors: { name?: string; headersText?: string }
  unsafeHeaderNames?: string[]
  parsedHeaders: Record<string, string> | null
}

/**
 * Validates a custom template draft. The headers payload must be a non-empty
 * flat JSON object of string values, and it must not try to set headers the
 * relay owns (credentials, transport framing) since the backend strips those.
 */
export function validateHeaderProfileDraft(
  draft: HeaderProfileDraft,
  existingProfiles: HeaderProfile[] = []
): HeaderProfileDraftValidation {
  const errors: HeaderProfileDraftValidation['errors'] = {}
  const name = draft.name.trim()
  const headersText = draft.headersText.trim()
  const currentId = (draft.id ?? '').trim()

  if (!name) {
    errors.name = 'Name is required'
  } else if (
    existingProfiles.some(
      (profile) => profile.id !== currentId && profile.name.trim() === name
    )
  ) {
    errors.name = 'A template with this name already exists'
  }

  if (!headersText) {
    errors.headersText = 'Headers JSON is required'
    return { isValid: false, errors, parsedHeaders: null }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(headersText)
  } catch {
    errors.headersText = 'Headers JSON must be valid JSON'
    return { isValid: false, errors, parsedHeaders: null }
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length === 0
  ) {
    errors.headersText = 'Headers JSON must be a non-empty object'
    return { isValid: false, errors, parsedHeaders: null }
  }

  const entries = Object.entries(parsed as Record<string, unknown>)
  if (entries.some(([, value]) => typeof value !== 'string')) {
    errors.headersText = 'Headers JSON values must all be strings'
    return { isValid: false, errors, parsedHeaders: null }
  }
  if (entries.some(([key]) => !key.trim())) {
    errors.headersText = 'Header names cannot be empty'
    return { isValid: false, errors, parsedHeaders: null }
  }

  const unsafe = entries
    .map(([key]) => key)
    .filter((key) => isUnsafeCustomHeaderName(key))
  if (unsafe.length > 0) {
    errors.headersText =
      'These headers are managed by the relay and cannot be set: {{headers}}'
    return {
      isValid: false,
      errors,
      unsafeHeaderNames: unsafe,
      parsedHeaders: null,
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    parsedHeaders: Object.fromEntries(entries) as Record<string, string>,
  }
}

export const HEADER_PROFILE_DRAFT_EXAMPLE = JSON.stringify(
  {
    'User-Agent': 'MyApp/1.0',
    'X-Client-Name': 'my-client',
  },
  null,
  2
)
