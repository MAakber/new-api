import { MESSAGE_STATUS } from '../../constants'
import type {
  Message,
  MessageSnapshot,
  PlaygroundEvent,
  PlaygroundPart,
  PlaygroundRun,
} from '../../types'
import {
  mergeWebSearchSources,
  type StreamMessageUpdate,
} from '../streaming/stream-utils'
import {
  applyStreamingChunk,
  processStreamingContent,
} from './message-streaming-utils'
import {
  completeReasoningTiming,
  startReasoningTiming,
} from './message-timing-utils'

export function snapshotMessage(message: Message): MessageSnapshot {
  return {
    run: message.run,
    sources: message.sources,
    reasoning: message.reasoning,
    createdAt: message.createdAt,
    startedAt: message.startedAt,
    completedAt: message.completedAt,
    durationMs: message.durationMs,
    status: message.status,
    errorMessage: message.errorMessage,
    errorCode: message.errorCode,
  }
}

export function selectMessageVersion(
  message: Message,
  versionID?: string
): Message {
  const version = message.versions.find((item) => item.id === versionID)
  if (!version || version === message.versions[0]) return message
  return {
    key: message.key,
    from: message.from,
    versions: [version],
    status: MESSAGE_STATUS.COMPLETE,
    ...version.snapshot,
    isReasoningStreaming: false,
  }
}

export function applyStreamMessageUpdate(
  message: Message,
  update: StreamMessageUpdate
): Message {
  if (update.type === 'event') {
    return applyPlaygroundEvent(message, update.event)
  }
  if (update.type === 'sources') {
    return {
      ...message,
      sources: mergeWebSearchSources(message.sources, update.sources),
    }
  }
  return applyStreamingChunk(message, update.type, update.chunk)
}

export function applyPlaygroundEvent(
  message: Message,
  event: PlaygroundEvent
): Message {
  if (event.type === 'ping' || message.status === MESSAGE_STATUS.ERROR) {
    return message
  }
  if (event.type === 'run') {
    return {
      ...message,
      run: {
        run_id: event.run_id,
        search_mode: event.search_mode,
        parts: [],
        tool_calls: [],
      },
    }
  }
  const run: PlaygroundRun = message.run ?? {
    run_id: message.key,
    search_mode: 'off',
    parts: [],
    tool_calls: [],
  }
  if (event.type === 'usage') {
    return { ...message, run: { ...run, usage: event.usage } }
  }
  if (event.type === 'complete') {
    return {
      ...message,
      durationMs: event.duration_ms,
      sources: mergeWebSearchSources([], event.sources),
      run: { ...run, duration_ms: event.duration_ms, usage: event.usage },
    }
  }
  if (event.type === 'tool') {
    const exists = run.tool_calls.some((tool) => tool.id === event.tool.id)
    return {
      ...completeReasoningTiming(message),
      status: MESSAGE_STATUS.STREAMING,
      run: {
        ...run,
        parts: exists
          ? run.parts
          : [
              ...run.parts,
              {
                type: 'tool',
                tool_call_id: event.tool.id,
                round_id: event.tool.round_id,
              },
            ],
        tool_calls: exists
          ? run.tool_calls.map((tool) =>
              tool.id === event.tool.id ? event.tool : tool
            )
          : [...run.tool_calls, event.tool],
      },
    }
  }
  const parts = [...run.parts]
  let updated = message
  for (const part of [
    {
      type: 'reasoning',
      text: event.reasoning_content,
      round_id: event.round_id,
    },
    { type: 'text', text: event.content, round_id: event.round_id },
  ] satisfies PlaygroundPart[]) {
    if (!part.text) continue
    const last = parts.at(-1)
    if (last?.type === part.type && last.round_id === part.round_id) {
      parts[parts.length - 1] = { ...last, text: (last.text ?? '') + part.text }
    } else {
      parts.push(part)
    }
    if (part.type === 'reasoning') {
      const reasoning = startReasoningTiming(updated)
      updated = {
        ...updated,
        reasoning: { ...reasoning, content: reasoning.content + part.text },
        isReasoningStreaming: true,
      }
    } else {
      updated = completeReasoningTiming(
        processStreamingContent(updated, part.text)
      )
    }
  }
  return {
    ...updated,
    status: MESSAGE_STATUS.STREAMING,
    run: { ...run, parts },
  }
}
