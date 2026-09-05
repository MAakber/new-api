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
import { ERROR_MESSAGES } from '../../constants'
import type { ChatCompletionChunk, WebSearchSource } from '../../types'

const STREAM_DONE_MESSAGE = '[DONE]'
const STREAM_CLOSED_READY_STATE = 2

export type StreamUpdateType = 'reasoning' | 'content' | 'sources'

export type StreamMessageUpdate =
  | {
      type: 'reasoning' | 'content'
      chunk: string
    }
  | {
      type: 'sources'
      sources: WebSearchSource[]
    }

type StreamErrorPayload = {
  error?: {
    code?: string
    message?: string
  }
}

export type StreamErrorDetails = {
  errorCode?: string
  errorMessage: string
}

export function parseStreamErrorDetails(data?: string): StreamErrorDetails {
  const fallbackMessage = data || ERROR_MESSAGES.API_REQUEST_ERROR

  if (!data) {
    return { errorMessage: fallbackMessage }
  }

  try {
    const parsed = JSON.parse(data) as StreamErrorPayload

    if (!parsed?.error) {
      return { errorMessage: fallbackMessage }
    }

    return {
      errorCode: parsed.error.code || undefined,
      errorMessage: parsed.error.message || fallbackMessage,
    }
  } catch {
    return { errorMessage: fallbackMessage }
  }
}

export function parseStreamMessageUpdates(data: string): StreamMessageUpdate[] {
  const chunk = JSON.parse(data) as ChatCompletionChunk
  const delta = chunk.choices?.[0]?.delta

  if (!delta) {
    return []
  }

  const updates: StreamMessageUpdate[] = []

  if (delta.reasoning_content) {
    updates.push({ type: 'reasoning', chunk: delta.reasoning_content })
  }

  if (delta.content) {
    updates.push({ type: 'content', chunk: delta.content })
  }

  const sources = normalizeWebSearchSources(delta.web_search?.sources)
  if (sources.length > 0) {
    updates.push({ type: 'sources', sources })
  }

  return updates
}

export function normalizeWebSearchSources(sources: unknown): WebSearchSource[] {
  if (!Array.isArray(sources)) {
    return []
  }

  const normalized: WebSearchSource[] = []
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue
    }

    const candidate = source as { href?: unknown; title?: unknown }
    if (typeof candidate.href !== 'string') {
      continue
    }

    let parsed: URL
    try {
      parsed = new URL(candidate.href)
    } catch {
      continue
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue
    }

    const href = parsed.toString()
    if (normalized.some((item) => item.href === href)) {
      continue
    }

    const title =
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : parsed.hostname
    normalized.push({ href, title })

    if (normalized.length >= 20) {
      break
    }
  }
  return normalized
}

export function mergeWebSearchSources(
  current: WebSearchSource[] | undefined,
  incoming: WebSearchSource[]
): WebSearchSource[] {
  return normalizeWebSearchSources([...(current ?? []), ...incoming])
}

export function isStreamDoneMessage(data: string): boolean {
  return data === STREAM_DONE_MESSAGE
}

export function isStreamClosedReadyState(readyState?: number): boolean {
  return readyState === STREAM_CLOSED_READY_STATE
}

export function getStreamReadyStateError(
  eventReadyState: number | undefined,
  source: unknown
): string | null {
  const status = (source as { status?: number }).status

  if (
    eventReadyState !== undefined &&
    eventReadyState >= STREAM_CLOSED_READY_STATE &&
    status !== undefined &&
    status !== 200
  ) {
    return `HTTP ${status}: ${ERROR_MESSAGES.CONNECTION_CLOSED}`
  }

  return null
}
