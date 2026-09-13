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
import type {
  ChatCompletionChunk,
  PlaygroundEvent,
  WebSearchSource,
} from '../../types'
import {
  playgroundEventSchema,
  playgroundUsageSchema,
} from './playground-event-schema'
import {
  parseAPIErrorDetails,
  type RequestErrorDetails,
} from './request-error-utils'

const STREAM_DONE_MESSAGE = '[DONE]'
const STREAM_CLOSED_READY_STATE = 2

export type StreamUpdateType = 'reasoning' | 'content' | 'sources'

export type StreamMessageUpdate =
  | { type: 'event'; event: PlaygroundEvent }
  | {
      type: 'reasoning' | 'content'
      chunk: string
    }
  | {
      type: 'sources'
      sources: WebSearchSource[]
    }

export type StreamErrorDetails = RequestErrorDetails

export class StreamResponseError extends Error {
  readonly errorCode?: string
  constructor(details: StreamErrorDetails) {
    super(details.errorMessage)
    this.name = 'StreamResponseError'
    this.errorCode = details.errorCode
  }
}

export function parseStreamErrorDetails(
  data?: string,
  status?: number
): StreamErrorDetails {
  return parseAPIErrorDetails(data, status)
}

export function parseStreamMessageUpdates(data: string): StreamMessageUpdate[] {
  const chunk = JSON.parse(data) as ChatCompletionChunk & { error?: unknown }
  if (chunk.error) throw new StreamResponseError(parseAPIErrorDetails(chunk))
  const delta = chunk.choices?.[0]?.delta
  const updates: StreamMessageUpdate[] = []
  if (chunk.playground) {
    const event = playgroundEventSchema.parse(chunk.playground)
    if (event.type === 'delta') {
      return [
        {
          type: 'event',
          event: playgroundEventSchema.parse({
            ...event,
            content: delta?.content,
            reasoning_content: delta?.reasoning_content,
          }),
        },
      ]
    }
    if (event.type === 'complete') {
      return [
        {
          type: 'event',
          event: {
            ...event,
            sources: normalizeWebSearchSources(event.sources),
          },
        },
      ]
    }
    if (event.type !== 'ping') updates.push({ type: 'event', event })
  }
  if (chunk.usage) {
    const usage = chunk.usage
    updates.push({
      type: 'event',
      event: {
        type: 'usage',
        usage: playgroundUsageSchema.parse({
          input_tokens: usage.input_tokens ?? usage.prompt_tokens,
          output_tokens: usage.output_tokens ?? usage.completion_tokens,
          total_tokens: usage.total_tokens,
          cached_tokens: usage.prompt_tokens_details?.cached_tokens,
          cache_write_tokens:
            usage.prompt_tokens_details?.cache_write_tokens ??
            usage.prompt_tokens_details?.cached_creation_tokens,
          reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens,
        }),
      },
    })
  }
  if (!delta) return updates

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

    const candidate = source as Record<string, unknown>
    if (typeof candidate.href !== 'string') {
      continue
    }

    let parsed: URL
    try {
      parsed = new URL(candidate.href)
    } catch {
      continue
    }

    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password
    ) {
      continue
    }

    const href = parsed.toString()
    const existing = normalized.find((item) => item.href === href)
    if (existing) {
      if (candidate.cited === true) existing.cited = true
      continue
    }

    const title =
      typeof candidate.title === 'string' && candidate.title.trim()
        ? candidate.title.trim()
        : parsed.hostname
    const item: WebSearchSource = { href, title }
    if (typeof candidate.id === 'string') item.id = candidate.id
    if (typeof candidate.tool_call_id === 'string') {
      item.tool_call_id = candidate.tool_call_id
    }
    if (typeof candidate.published_at === 'string') {
      item.published_at = candidate.published_at
    }
    if (typeof candidate.cited === 'boolean') item.cited = candidate.cited
    normalized.push(item)
  }
  normalized.sort((a, b) => Number(Boolean(b.cited)) - Number(Boolean(a.cited)))
  return normalized.filter((source, index) => source.cited || index < 32)
}

export function mergeWebSearchSources(
  current: WebSearchSource[] | undefined,
  incoming: WebSearchSource[] | undefined
): WebSearchSource[] {
  return normalizeWebSearchSources([...(current ?? []), ...(incoming ?? [])])
}

export function isStreamDoneMessage(data: string): boolean {
  return data === STREAM_DONE_MESSAGE
}

export function isStreamClosedReadyState(readyState?: number): boolean {
  return readyState === STREAM_CLOSED_READY_STATE
}

export function getStreamReadyStateError(
  eventReadyState: number | undefined,
  responseCode?: number
): string | null {
  if (!isStreamClosedReadyState(eventReadyState)) return null
  if (
    responseCode !== undefined &&
    (responseCode < 200 || responseCode >= 300)
  ) {
    return parseAPIErrorDetails(undefined, responseCode).errorMessage
  }
  return ERROR_MESSAGES.INTERRUPTED
}
