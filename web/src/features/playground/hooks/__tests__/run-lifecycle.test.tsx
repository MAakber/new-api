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
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { assert, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../constants'
import { createLoadingAssistantMessage } from '../../lib/message/message-utils'
import { useChatHandler } from '../use-chat-handler'

const transport = vi.hoisted(() => ({ source: null as EventTarget | null }))
vi.mock('sse.js', () => ({
  SSE: class extends EventTarget {
    constructor() {
      super()
      transport.source = this
    }
    stream() {}
    close() {}
  },
}))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getFreshAuthHeaders: async () => ({ Authorization: 'Bearer fixture' }),
}))

describe('Run lifecycle', () => {
  it('retains the partial answer and usage when a non-streaming model round fails', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({
      response: {
        status: 502,
        data: {
          error: { message: 'Provider unavailable' },
          playground: {
            run_id: 'partial',
            search_mode: 'mcp',
            parts: [{ type: 'text', text: 'Partial answer', round_id: 1 }],
            tool_calls: [],
            usage: { input_tokens: 9, output_tokens: 2, partial: true },
            duration_ms: 1200,
          },
          sources: [
            {
              href: 'https://example.com/source',
              title: 'Source',
              cited: true,
            },
          ],
        },
      },
    })
    const initial = createLoadingAssistantMessage()
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState([initial])
      const handler = useChatHandler({
        config: { ...DEFAULT_CONFIG, stream: false },
        parameterEnabled: DEFAULT_PARAMETER_ENABLED,
        onMessageUpdate: setMessages,
      })
      return { ...handler, messages }
    })
    await act(async () => result.current.sendChat([initial]))
    await waitFor(() => expect(result.current.isGenerating).toBe(false))
    expect(result.current.messages[0].versions[0].content).toBe(
      'Partial answer'
    )
    expect(result.current.messages[0].errorMessage).toContain(
      'Provider unavailable'
    )
    expect(result.current.messages[0].run?.usage?.input_tokens).toBe(9)
    expect(result.current.messages[0].durationMs).toBe(1200)
    expect(result.current.messages[0].sources?.[0].cited).toBe(true)
  })

  it('preserves the previous run snapshot when stopping without active tools', async () => {
    const initial = createLoadingAssistantMessage()
    const run = {
      run_id: 'r',
      search_mode: 'off' as const,
      parts: [],
      tool_calls: [],
      usage: { partial: false },
    }
    initial.run = run
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState([initial])
      const handler = useChatHandler({
        config: DEFAULT_CONFIG,
        parameterEnabled: DEFAULT_PARAMETER_ENABLED,
        onMessageUpdate: setMessages,
      })
      return { ...handler, messages }
    })
    await act(async () => result.current.sendChat([initial]))
    act(() => result.current.stopGeneration())
    expect(result.current.messages[0].run?.usage?.partial).toBe(true)
    expect(initial.run).toBe(run)
    expect(initial.run.usage?.partial).toBe(false)
  })

  it('flushes queued content and tool events when stopped in the same React batch', async () => {
    const initial = createLoadingAssistantMessage()
    const { result } = renderHook(() => {
      const [messages, setMessages] = useState([initial])
      const handler = useChatHandler({
        config: DEFAULT_CONFIG,
        parameterEnabled: DEFAULT_PARAMETER_ENABLED,
        onMessageUpdate: setMessages,
      })
      return { ...handler, messages }
    })
    await act(async () => {
      result.current.sendChat([initial])
      await Promise.resolve()
      const source = transport.source
      assert(source, 'The streaming transport should be initialized')
      source.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            playground: { type: 'run', run_id: 'r', search_mode: 'mcp' },
          }),
        })
      )
      source.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            playground: { type: 'delta', round_id: 1 },
            choices: [{ delta: { content: 'Keep this partial answer' } }],
          }),
        })
      )
      source.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            playground: {
              type: 'tool',
              tool: {
                id: 't',
                round_id: 1,
                server_name: 'fixture',
                name: 'search',
                kind: 'search',
                state: 'running',
                input: {},
                duration_ms: 0,
              },
            },
          }),
        })
      )
      result.current.stopGeneration()
    })
    expect(result.current.messages[0].versions[0].content).toBe(
      'Keep this partial answer'
    )
    expect(result.current.messages[0].run?.tool_calls[0].state).toBe(
      'cancelled'
    )
    expect(result.current.isGenerating).toBe(false)
  })
})
