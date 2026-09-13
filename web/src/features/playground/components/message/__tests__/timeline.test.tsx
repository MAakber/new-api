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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { PlaygroundRun, PlaygroundToolCall } from '../../../types'
import { MessageToolTimeline } from '../message-tool-timeline'

const tool: PlaygroundToolCall = {
  id: 'lookup-1',
  round_id: 1,
  server_name: 'Reference service',
  name: 'lookup',
  kind: 'search',
  state: 'running',
  input: { query: 'Weather' },
  duration_ms: 0,
}

const run: PlaygroundRun = {
  run_id: 'weather-run',
  search_mode: 'mcp',
  parts: [
    { type: 'text', round_id: 1, text: 'Checking the weather.' },
    { type: 'tool', round_id: 1, tool_call_id: tool.id },
  ],
  tool_calls: [tool],
}

describe('Message tool timeline', () => {
  it('keeps a tool expanded when it completes and places the answer after the tool', async () => {
    const user = userEvent.setup()
    const rendered = render(<MessageToolTimeline run={run} final={false} />)
    const trigger = screen.getByRole('button', {
      name: /Reference service · lookup/,
    })
    await user.tab()
    expect(trigger).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Parameters')).toBeVisible()

    rendered.rerender(
      <MessageToolTimeline
        final
        run={{
          ...run,
          parts: [
            ...run.parts,
            { type: 'text', round_id: 2, text: 'The forecast is sunny.' },
          ],
          tool_calls: [
            { ...tool, state: 'completed', duration_ms: 250, output: 'Sunny' },
          ],
        }}
      />
    )

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Completed')).toBeVisible()
    expect(screen.getByText('Result')).toBeVisible()
    const before = screen.getByText('Checking the weather.')
    const answer = screen.getByText('The forecast is sunny.')
    expect(
      before.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(
      trigger.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows tool failures with their details and preserves cancelled tool status', () => {
    const rendered = render(
      <MessageToolTimeline
        final
        run={{
          ...run,
          tool_calls: [
            { ...tool, state: 'error', error: 'Search unavailable' },
          ],
        }}
      />
    )
    expect(screen.getByText('Search unavailable')).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Reference service · lookup/ })
    ).toHaveAttribute('aria-expanded', 'true')

    rendered.rerender(
      <MessageToolTimeline
        final
        run={{
          ...run,
          run_id: 'cancelled-run',
          tool_calls: [{ ...tool, state: 'cancelled' }],
        }}
      />
    )
    expect(screen.getByText('Cancelled')).toBeVisible()
    expect(screen.queryByText('Search unavailable')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Reference service · lookup/ })
    ).toHaveAttribute('aria-expanded', 'false')
  })
})
