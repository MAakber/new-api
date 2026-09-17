import { assert, describe, expect, it } from 'vitest'

import type { PlaygroundToolCall } from '../../../types'
import { loadMessages, saveMessages } from '../../storage/storage'
import {
  MAX_LOADED_MESSAGE_CHARS,
  MAX_STORED_MESSAGES_BYTES,
} from '../../storage/storage-schema'
import { createRegeneratedMessages } from '../conversation-message-utils'
import {
  applyPlaygroundEvent,
  selectMessageVersion,
} from '../message-run-utils'
import {
  completeAssistantMessage,
  settleToolCalls,
} from '../message-streaming-utils'
import { updateAssistantMessageWithError } from '../message-update-utils'
import { createLoadingAssistantMessage } from '../message-utils'

const tool: PlaygroundToolCall = {
  id: 'call-search',
  round_id: 1,
  name: 'search',
  server_name: 'Search service',
  kind: 'search',
  state: 'running',
  input: { query: 'weather' },
  duration_ms: 0,
}

describe('Playground run history', () => {
  it.each([MAX_LOADED_MESSAGE_CHARS, MAX_STORED_MESSAGES_BYTES + 1])(
    'bounds provider error details of %i characters without losing the partial answer',
    (length) => {
      const message = applyPlaygroundEvent(createLoadingAssistantMessage(), {
        type: 'delta',
        round_id: 1,
        content: 'Partial answer',
      })
      const failed = updateAssistantMessageWithError(
        [message],
        'Provider unavailable: ' + 'x'.repeat(length)
      )[0]

      saveMessages([failed])
      const restored = loadMessages()?.[0]

      expect(restored?.errorMessage?.length).toBeLessThanOrEqual(
        MAX_LOADED_MESSAGE_CHARS
      )
      expect(restored?.errorMessage).toContain('Provider unavailable:')
      expect(restored?.versions[0].content).toBe('Partial answer')
    }
  )

  it('keeps repeated delta text and ordered tool steps, then preserves the run when regenerated', () => {
    let message = applyPlaygroundEvent(createLoadingAssistantMessage(), {
      type: 'run',
      run_id: 'run-1',
      search_mode: 'mcp',
    })
    message = applyPlaygroundEvent(message, {
      type: 'delta',
      round_id: 1,
      content: 'ha',
    })
    message = applyPlaygroundEvent(message, {
      type: 'delta',
      round_id: 1,
      content: 'ha',
    })
    message = applyPlaygroundEvent(message, { type: 'tool', tool })
    message = applyPlaygroundEvent(message, {
      type: 'tool',
      tool: { ...tool, state: 'completed', output: 'Sunny', duration_ms: 250 },
    })
    message = applyPlaygroundEvent(message, {
      type: 'delta',
      round_id: 2,
      content: 'Sunny.',
    })
    message = applyPlaygroundEvent(message, {
      type: 'complete',
      duration_ms: 1200,
      sources: [
        { href: 'https://example.com/', title: 'Weather', cited: true },
      ],
      usage: { input_tokens: 100, cached_tokens: 0, output_tokens: 5 },
    })
    message = completeAssistantMessage(message)
    expect(message.versions[0].content).toBe('hahaSunny.')
    expect(message.run?.parts.map((part) => part.type)).toEqual([
      'text',
      'tool',
      'text',
    ])
    expect(message.durationMs).toBe(1200)
    const regenerated = createRegeneratedMessages([message], message.key)?.[0]
    assert(regenerated, 'Regeneration should create a new message version')
    expect(regenerated.run).toBeUndefined()
    const old = selectMessageVersion(regenerated, message.versions[0].id)
    expect(old.run?.usage?.input_tokens).toBe(100)
    expect(old.run?.tool_calls[0].state).toBe('completed')
    expect(old.sources?.[0].cited).toBe(true)
    saveMessages([regenerated])
    const restored = loadMessages()?.[0]
    assert(restored, 'The saved conversation should be restored')
    expect(selectMessageVersion(restored, message.versions[0].id).run).toEqual(
      old.run
    )
  })

  it('preserves partial content and settles pending tools when a request fails', () => {
    let message = applyPlaygroundEvent(createLoadingAssistantMessage(), {
      type: 'run',
      run_id: 'failed',
      search_mode: 'mcp',
    })
    message = applyPlaygroundEvent(message, {
      type: 'delta',
      round_id: 1,
      content: 'Partial answer',
    })
    message = applyPlaygroundEvent(message, { type: 'tool', tool })
    const failed = updateAssistantMessageWithError(
      [message],
      'Provider unavailable'
    )[0]
    expect(failed.status).toBe('error')
    expect(failed.versions[0].content).toBe('Partial answer')
    expect(failed.errorMessage).toContain('Provider unavailable')
    expect(failed.run?.tool_calls[0].state).toBe('cancelled')
  })

  it('restores interrupted tool calls as cancelled without discarding completed calls', () => {
    let message = applyPlaygroundEvent(createLoadingAssistantMessage(), {
      type: 'run',
      run_id: 'cancelled',
      search_mode: 'mcp',
    })
    message = applyPlaygroundEvent(message, { type: 'tool', tool })
    message = applyPlaygroundEvent(message, {
      type: 'tool',
      tool: { ...tool, id: 'done', state: 'completed' },
    })
    saveMessages([message])
    const restored = loadMessages()?.[0]
    assert(restored, 'The saved conversation should be restored')
    expect(restored.run?.tool_calls.map((call) => call.state)).toEqual([
      'cancelled',
      'completed',
    ])
    expect(settleToolCalls(restored)).toBe(restored)
  })
})
