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
