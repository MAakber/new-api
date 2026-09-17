/** Mirrors the gateway's cap on an uploaded plugin logo. */
export const MAX_PLUGIN_ICON_BYTES = 512 * 1024

export type PluginIconMediaType = 'image/png' | 'image/svg+xml'

/**
 * Media type of a sidecar logo file, decided by extension because browsers
 * report an empty or vendor-specific type for SVG files on some platforms.
 * Returns null for anything that is not icon.svg / icon.png material.
 */
export function pluginIconMediaType(
  fileName: string
): PluginIconMediaType | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  return null
}

export type PluginIconFileFailure = 'unsupported_type' | 'too_large'

export class PluginIconFileError extends Error {
  constructor(public reason: PluginIconFileFailure) {
    super(reason)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk))
  }
  return btoa(binary)
}

/**
 * Encodes a sidecar logo as the data URI the upload endpoint stores. The bytes
 * never enter the plugin source; they travel in their own request field.
 */
export async function encodePluginIconFile(file: File): Promise<string> {
  const mediaType = pluginIconMediaType(file.name)
  if (!mediaType) throw new PluginIconFileError('unsupported_type')
  if (file.size > MAX_PLUGIN_ICON_BYTES) {
    throw new PluginIconFileError('too_large')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  return `data:${mediaType};base64,${bytesToBase64(bytes)}`
}

async function sha256Hex(
  bytes: Uint8Array<ArrayBuffer>
): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export type FetchPluginIconOptions = {
  /** Index-declared digest; a mismatch yields null so a swapped file is never shown or stored. */
  sha256?: string
  fetchImpl?: typeof fetch
}

/**
 * Fetches a marketplace plugin's sidecar logo from the index repository and
 * returns it as a data URI, both for display and for the upload request. The
 * bytes are fetched rather than linked with `<img src>` because raw hosting
 * such as raw.githubusercontent.com serves SVG as text/plain with nosniff,
 * which browsers refuse to render as an image. Returns null when the fetch
 * fails, the file is not an SVG/PNG within the cap, or the digest does not
 * match: a logo must never block installation, so errors are swallowed.
 */
export async function fetchPluginIconDataUri(
  url: string,
  options: FetchPluginIconOptions = {}
): Promise<string | null> {
  const mediaType = pluginIconMediaType(new URL(url).pathname)
  if (!mediaType) return null
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(url)
  } catch {
    return null
  }
  if (!response.ok) return null
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_PLUGIN_ICON_BYTES) return null
  const expected = options.sha256?.trim().toLowerCase()
  if (expected) {
    const actual = await sha256Hex(bytes)
    if (actual !== null && actual !== expected) return null
  }
  return `data:${mediaType};base64,${bytesToBase64(bytes)}`
}
