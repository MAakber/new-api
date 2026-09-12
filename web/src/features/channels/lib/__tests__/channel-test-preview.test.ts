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
import { describe, expect, it } from 'vitest'

import { parseChannelTestPreview } from '../channel-test-preview'

const sse = (...events: unknown[]) =>
  events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')

describe('channel test response presentation', () => {
  it.each([
    [
      'openai',
      {
        choices: [
          { message: { content: '', reasoning_content: 'Let me think.' } },
        ],
      },
    ],
    [
      'openai-response',
      {
        output: [
          {
            type: 'reasoning',
            summary: [{ type: 'summary_text', text: 'Let me think.' }],
          },
        ],
      },
    ],
    [
      'anthropic',
      { content: [{ type: 'thinking', thinking: 'Let me think.' }] },
    ],
    [
      'gemini',
      {
        candidates: [
          { content: { parts: [{ text: 'Let me think.', thought: true }] } },
        ],
      },
    ],
  ])(
    'keeps reasoning separate from the final answer in %s JSON',
    (endpoint, payload) => {
      expect(
        parseChannelTestPreview(JSON.stringify(payload), String(endpoint))
      ).toMatchObject({
        text: '',
        reasoning: 'Let me think.',
      })
    }
  )

  it('joins streamed reasoning and retains the separate final answer', () => {
    const raw = sse(
      { choices: [{ index: 0, delta: { reasoning_content: 'Let me ' } }] },
      { choices: [{ index: 0, delta: { reasoning_content: 'think.' } }] },
      {
        choices: [
          { index: 0, delta: { content: 'pong' }, finish_reason: 'stop' },
        ],
      }
    )
    expect(parseChannelTestPreview(raw, 'openai')).toMatchObject({
      text: 'pong',
      reasoning: 'Let me think.',
    })
  })

  it.each([
    [
      'openai-response',
      sse(
        {
          type: 'response.reasoning_summary_text.delta',
          output_index: 0,
          summary_index: 0,
          delta: 'Let me ',
        },
        {
          type: 'response.reasoning_summary_text.delta',
          output_index: 0,
          summary_index: 0,
          delta: 'think.',
        },
        {
          type: 'response.reasoning_summary_text.done',
          output_index: 0,
          summary_index: 0,
          text: 'Let me think.',
        },
        {
          type: 'response.incomplete',
          response: {
            status: 'incomplete',
            output: [
              {
                type: 'reasoning',
                summary: [{ type: 'summary_text', text: 'Let me think.' }],
              },
            ],
          },
        }
      ),
    ],
    [
      'anthropic',
      sse(
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: 'Let me ' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'think.' },
        }
      ),
    ],
    [
      'gemini',
      sse(
        {
          candidates: [
            { content: { parts: [{ text: 'Let me ', thought: true }] } },
          ],
        },
        {
          candidates: [
            { content: { parts: [{ text: 'think.', thought: true }] } },
          ],
        }
      ),
    ],
  ])(
    'merges %s reasoning events without repeating the completed summary',
    (endpoint, raw) => {
      expect(parseChannelTestPreview(raw, endpoint)).toMatchObject({
        text: '',
        reasoning: 'Let me think.',
      })
    }
  )

  it.each([
    ['openai', { choices: [{ message: { content: 'pong' } }] }],
    [
      'openai-response',
      {
        output: [
          { type: 'message', content: [{ type: 'output_text', text: 'pong' }] },
        ],
      },
    ],
    ['anthropic', { content: [{ type: 'text', text: 'pong' }] }],
    ['gemini', { candidates: [{ content: { parts: [{ text: 'pong' }] } }] }],
  ])('extracts the complete text from %s JSON', (endpoint, payload) => {
    expect(
      parseChannelTestPreview(JSON.stringify(payload), String(endpoint)).text
    ).toBe('pong')
  })

  it('joins Chat text and arguments without combining different tool calls', () => {
    const raw = sse(
      {
        choices: [
          {
            index: 0,
            delta: {
              content: 'po',
              tool_calls: [
                {
                  index: 0,
                  id: 'a',
                  function: { name: 'first', arguments: '{"message":' },
                },
                {
                  index: 1,
                  id: 'b',
                  function: { name: 'second', arguments: '{"message":' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            index: 0,
            delta: {
              content: 'ng',
              tool_calls: [
                { index: 1, function: { arguments: '"two"}' } },
                { index: 0, function: { arguments: '"one"}' } },
              ],
            },
          },
        ],
      }
    )
    expect(parseChannelTestPreview(raw, 'openai')).toEqual({
      text: 'pong',
      reasoning: '',
      images: [],
      tools: [
        { id: '0:0', name: 'first', arguments: '{"message":"one"}' },
        { id: '0:1', name: 'second', arguments: '{"message":"two"}' },
      ],
    })
  })

  it('replaces Responses deltas with completed output instead of displaying duplicate content', () => {
    const raw = sse(
      { type: 'response.output_text.delta', output_index: 0, delta: 'pong' },
      {
        type: 'response.output_item.added',
        output_index: 1,
        item: {
          type: 'function_call',
          name: 'channel_test_echo',
          arguments: '',
        },
      },
      {
        type: 'response.function_call_arguments.delta',
        output_index: 1,
        delta: '{"message":"ping"}',
      },
      {
        type: 'response.completed',
        response: {
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'pong' }],
            },
            {
              type: 'function_call',
              name: 'channel_test_echo',
              arguments: '{"message":"ping"}',
            },
          ],
        },
      }
    )
    const result = parseChannelTestPreview(raw, 'openai-response')
    expect(result.text).toBe('pong')
    expect(result.tools).toEqual([
      { id: '1', name: 'channel_test_echo', arguments: '{"message":"ping"}' },
    ])
  })

  it('merges Anthropic blocks and Gemini SSE content into readable replies', () => {
    const claude = sse(
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'pong' },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: {
          type: 'tool_use',
          name: 'channel_test_echo',
          input: {},
        },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"message":' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '"ping"}' },
      }
    )
    expect(parseChannelTestPreview(claude, 'anthropic')).toEqual({
      text: 'pong',
      reasoning: '',
      images: [],
      tools: [
        { id: '1', name: 'channel_test_echo', arguments: '{"message":"ping"}' },
      ],
    })
    const gemini = sse(
      { candidates: [{ content: { parts: [{ text: 'po' }] } }] },
      {
        candidates: [
          {
            content: {
              parts: [
                { text: 'ng' },
                {
                  functionCall: {
                    name: 'channel_test_echo',
                    args: { message: 'ping' },
                  },
                },
              ],
            },
          },
        ],
      }
    )
    expect(parseChannelTestPreview(gemini, 'gemini')).toMatchObject({
      text: 'pong',
      tools: [{ name: 'channel_test_echo', arguments: '{"message":"ping"}' }],
    })
  })

  it('shows complete image results and leaves invalid or unfamiliar data to the raw view', () => {
    const image = { b64_json: 'aGVsbG8=', output_format: 'webp' }
    expect(
      parseChannelTestPreview(
        JSON.stringify({ data: [image] }),
        'image-generation'
      ).images
    ).toEqual(['data:image/webp;base64,aGVsbG8='])
    expect(
      parseChannelTestPreview(
        sse(
          { type: 'image_generation.partial_image', b64_json: 'YWJj' },
          { type: 'image_generation.completed', ...image }
        ),
        'image-generation'
      ).images
    ).toEqual(['data:image/webp;base64,aGVsbG8='])
    expect(parseChannelTestPreview('invalid JSON', 'openai')).toEqual({
      text: '',
      reasoning: '',
      tools: [],
      images: [],
    })
    expect(
      parseChannelTestPreview(
        JSON.stringify({ data: [{ url: 'javascript:alert(1)' }] }),
        'image-generation'
      ).images
    ).toEqual([])
  })
})
