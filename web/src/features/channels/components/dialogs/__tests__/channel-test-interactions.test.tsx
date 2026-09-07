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
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

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

describe('channel test matrix interactions', () => {
  it('preserves the other three results when retrying a failed capability and shows keyboard-accessible details', async () => {
    const user = userEvent.setup()
    renderChannelTest()
    await user.click(screen.getByRole('button', { name: 'Start testing' }))
    await waitFor(() => expect(api.requests).toHaveLength(4))
    await act(async () => {
      api.requests[0]?.reply('passed')
      api.requests[1]?.reply('degraded')
      api.requests[2]?.reply('failed')
      api.requests[3]?.reply('passed')
    })
    const table = screen.getByRole('region', { name: 'Channel models' })
    expect(
      within(table).getByRole('button', {
        name: 'gpt-4o · Non-streaming: Passed',
      })
    ).toBeDefined()
    expect(
      within(table).getByRole('button', {
        name: 'gpt-4o · Streaming: Compatibility stream',
      })
    ).toBeDefined()
    expect(
      within(table)
        .getByText('Compatibility stream')
        .closest('[data-slot="status-badge"]')
        ?.classList.contains('whitespace-normal')
    ).toBe(true)
    expect(
      within(table).getByRole('button', {
        name: 'gpt-4o · Tools · non-streaming: Failed',
      })
    ).toBeDefined()
    expect(
      within(table).getByRole('button', {
        name: 'gpt-4o · Tools · streaming: Passed',
      })
    ).toBeDefined()
    expect(
      screen.queryByRole('button', { name: /Delete failed models/ })
    ).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Retest failures' }))
    await waitFor(() => expect(api.requests).toHaveLength(5))
    expect(api.requests[4]?.body).toMatchObject({
      model: 'gpt-4o',
      stream: false,
      test_type: 'tool_call',
    })
    await act(async () => api.requests[4]?.reply())
    expect(
      within(table).getByRole('button', {
        name: 'gpt-4o · Tools · non-streaming: Passed',
      })
    ).toBeDefined()
    const stream = within(table).getByRole('button', {
      name: 'gpt-4o · Streaming: Compatibility stream',
    })
    stream.focus()
    await user.keyboard('{Enter}')
    const details = screen.getByRole('dialog', { name: 'Test details' })
    expect(within(details).getByText('JSON')).toBeDefined()
    expect(within(details).getByText('12 ms')).toBeDefined()
    await user.click(
      within(details).getByRole('button', { name: 'Retest this capability' })
    )
    await waitFor(() => expect(api.requests).toHaveLength(6))
    expect(api.requests[5]?.body).toMatchObject({
      stream: true,
      test_type: 'basic',
    })
    await act(async () => api.requests[5]?.reply())
    await user.click(
      within(details).getByRole('button', { name: 'Close test details' })
    )
    await waitFor(() => expect(document.activeElement).toBe(stream))
    expect(
      within(table).getAllByRole('button', { name: /: Passed$/ })
    ).toHaveLength(4)
  })

  it('preserves selection across pages and filtering and only tests those selected models', async () => {
    const models = Array.from(
      { length: 31 },
      (_, index) => `model-${index + 1}`
    )
    renderChannelTest(models)
    const table = screen.getByRole('region', { name: 'Channel models' })
    await act(async () =>
      fireEvent.click(
        within(table).getByRole('checkbox', { name: 'Select model model-1' })
      )
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }))
    )
    await act(async () =>
      fireEvent.click(
        within(table).getByRole('checkbox', { name: 'Select model model-31' })
      )
    )
    await act(async () =>
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Filter models...' }),
        { target: { value: 'missing-model' } }
      )
    )
    expect(screen.getByText('2 models selected')).toBeDefined()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Test selected (2)' }))
    )
    await waitFor(() => expect(api.requests).toHaveLength(5))
    await api.finish()
    await waitFor(() => expect(api.requests).toHaveLength(8))
    await api.finish()
    expect(api.requests.map((request) => request.body.model)).toEqual([
      'model-1',
      'model-1',
      'model-1',
      'model-1',
      'model-31',
      'model-31',
      'model-31',
      'model-31',
    ])
  })

  it('shares five active slots across closing and reopening, discards late results, and stops queued probes', async () => {
    renderChannelTest(['model-a', 'model-b'])
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Start testing' }))
    )
    await waitFor(() => expect(api.requests).toHaveLength(5))
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Open probe dialog' }))
    )
    const table = screen.getByRole('region', { name: 'Channel models' })
    expect(
      within(table).getAllByRole('button', { name: /Not tested$/ })
    ).toHaveLength(8)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Start testing' }))
    )
    expect(api.requests).toHaveLength(5)
    expect(
      within(table).getAllByRole('button', { name: /Queued$/ })
    ).toHaveLength(8)
    await act(async () =>
      api.requests.slice(0, 5).forEach((request) => request.reply('failed'))
    )
    await waitFor(() => expect(api.requests).toHaveLength(10))
    expect(
      within(table).queryAllByRole('button', { name: /Failed$/ })
    ).toHaveLength(0)
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Stop testing' }))
    )
    expect(
      within(table).getAllByRole('button', { name: /Stopped$/ })
    ).toHaveLength(3)
    await api.finish()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Start testing' })
      ).toBeDefined()
    )
    expect(api.requests).toHaveLength(10)
    expect(
      within(table).getAllByRole('button', { name: /Passed$/ })
    ).toHaveLength(5)
  })

  it('marks only basic results stale after editing the prompt and requires confirmation to delete fully failed models', async () => {
    renderChannelTest()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Start testing' }))
    )
    await waitFor(() => expect(api.requests).toHaveLength(4))
    await act(async () =>
      api.requests.forEach((request) => request.reply('failed'))
    )
    const deleteButton = screen.getByRole('button', {
      name: 'Delete failed models (1)',
    })
    await act(async () => fireEvent.click(deleteButton))
    const confirm = screen.getByRole('alertdialog', {
      name: 'Delete failed models',
    })
    expect(api.mutations).toHaveLength(0)
    await act(async () =>
      fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    )
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Advanced settings' }))
    )
    await act(async () =>
      fireEvent.change(
        screen.getByRole('textbox', { name: 'Test message override' }),
        { target: { value: 'new prompt' } }
      )
    )
    const table = screen.getByRole('region', { name: 'Channel models' })
    expect(within(table).getAllByText('Settings changed')).toHaveLength(2)
    expect(
      screen.queryByRole('button', { name: /Delete failed models/ })
    ).toBeNull()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Retest failures' }))
    )
    await waitFor(() => expect(api.requests).toHaveLength(6))
    expect(
      api.requests
        .slice(4)
        .every((request) => request.body.test_type === 'tool_call')
    ).toBe(true)
    await api.finish()
  })
})
