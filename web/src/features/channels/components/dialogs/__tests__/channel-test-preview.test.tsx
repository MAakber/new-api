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
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it } from 'vitest'

import {
  channelTestApiFixture,
  renderChannelTest,
} from '../../../__tests__/channel-test-fixture'

let api: ReturnType<typeof channelTestApiFixture>
beforeEach(() => {
  api = channelTestApiFixture()
})
afterEach(async () => {
  cleanup()
  await api.finish()
  api.restore()
})

it('opens the full response from a preview button, keeps raw data collapsed, and restores keyboard focus', async () => {
  const user = userEvent.setup()
  const reply = `${'A long reply. '.repeat(800)}The final sentence.`
  const raw = JSON.stringify({ choices: [{ message: { content: reply } }] })
  renderChannelTest()
  const table = screen.getByRole('region', { name: 'Channel models' })
  await user.click(
    within(table).getByRole('button', {
      name: 'gpt-4o · Non-streaming: Not tested',
    })
  )
  await waitFor(() => expect(api.requests).toHaveLength(1))
  await act(async () => api.requests[0]?.reply('passed', raw))
  await user.click(
    within(table).getByRole('button', {
      name: 'gpt-4o · Non-streaming: Passed',
    })
  )
  const details = screen.getByRole('dialog', { name: 'Test details' })
  expect(within(details).queryByText(/The final sentence/)).toBeNull()
  const previewButton = within(details).getByRole('button', {
    name: 'Response preview',
  })
  previewButton.focus()
  await user.keyboard('{Enter}')
  const preview = screen.getByRole('dialog', { name: 'Response preview' })
  expect(within(preview).getByText(reply).textContent).toBe(reply)
  const rawButton = within(preview).getByRole('button', {
    name: 'Raw response',
  })
  expect(rawButton.getAttribute('aria-expanded')).toBe('false')
  expect(within(preview).queryByText(raw)).toBeNull()
  await user.click(rawButton)
  expect(rawButton.getAttribute('aria-expanded')).toBe('true')
  expect(within(preview).getByText(raw).textContent).toBe(raw)
  await user.keyboard('{Escape}')
  await waitFor(() => expect(document.activeElement).toBe(previewButton))
  await user.keyboard('{Enter}')
  expect(
    within(screen.getByRole('dialog', { name: 'Response preview' }))
      .getByRole('button', { name: 'Raw response' })
      .getAttribute('aria-expanded')
  ).toBe('false')
})

it('shows token-limited reasoning as a readable response and keeps the model out of failed-model deletion', async () => {
  const user = userEvent.setup()
  const reasoning = '先确认用户的问题。'
  const raw = JSON.stringify({
    choices: [
      {
        message: { content: '', reasoning_content: reasoning },
        finish_reason: 'length',
      },
    ],
    usage: {
      completion_tokens: 16,
      completion_tokens_details: { reasoning_tokens: 16 },
    },
  })
  renderChannelTest(['deepseek-flash'])
  await user.click(screen.getByRole('button', { name: 'Start testing' }))
  await waitFor(() => expect(api.requests).toHaveLength(4))
  await act(async () => {
    api.requests[0]?.reply('passed', raw, 'response_truncated')
    api.requests[1]?.reply('passed', raw, 'response_truncated')
    api.requests[2]?.reply('failed')
    api.requests[3]?.reply('failed')
  })
  expect(
    screen.queryByRole('button', { name: /Delete failed models/ })
  ).toBeNull()
  expect(
    screen.getByRole('button', { name: 'Select successful models (1)' })
  ).toBeDefined()
  const table = screen.getByRole('region', { name: 'Channel models' })
  await user.click(
    within(table).getByRole('button', {
      name: 'deepseek-flash · Non-streaming: Passed',
    })
  )
  const details = screen.getByRole('dialog', { name: 'Test details' })
  expect(
    within(details).getByText(
      'The model responded, but output stopped at the token limit.'
    )
  ).toBeDefined()
  await user.click(
    within(details).getByRole('button', { name: 'Response preview' })
  )
  const preview = screen.getByRole('dialog', { name: 'Response preview' })
  expect(
    within(preview).queryByText(
      'No readable output. Expand the raw response for details.'
    )
  ).toBeNull()
  expect(within(preview).getByText(reasoning)).toBeDefined()
  const reasoningButton = within(preview).getByRole('button', {
    name: 'Reasoning',
  })
  expect(reasoningButton.getAttribute('aria-expanded')).toBe('true')
  reasoningButton.focus()
  await user.keyboard('{Enter}')
  expect(reasoningButton.getAttribute('aria-expanded')).toBe('false')
  expect(
    within(preview)
      .getByRole('button', { name: 'Raw response' })
      .getAttribute('aria-expanded')
  ).toBe('false')
})
