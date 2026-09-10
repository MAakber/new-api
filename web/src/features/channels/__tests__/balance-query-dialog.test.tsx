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
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assert, describe, expect, it, vi } from 'vitest'

import { updateChannelBalance } from '../api'
import { BalanceQueryDialog } from '../components/dialogs/balance-query-dialog'
import type { Channel, ChannelBalanceResponse } from '../types'
import { renderChannelUI } from './fetch-models-fixtures'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  updateChannelBalance: vi.fn(),
}))
vi.mock('@/components/ai-elements/code-block', () => ({
  CodeBlock: (props: { code: string }) => <pre>{props.code}</pre>,
  CodeBlockCopyButton: () => null,
}))

describe('balance query window ownership', () => {
  it('keeps simultaneous raw responses and refreshes on their originating channels', async () => {
    const user = userEvent.setup()
    const first = { id: 401, name: 'First balance', type: 58 } as Channel
    const second = { id: 402, name: 'Second balance', type: 58 } as Channel
    vi.mocked(updateChannelBalance).mockResolvedValue({
      success: true,
      raw_response: '{"source":"refreshed second"}',
    })
    const view = renderChannelUI(
      <>
        <BalanceQueryDialog
          open
          channel={first}
          initialRawResponse='{"source":"first"}'
          onOpenChange={vi.fn()}
        />
        <BalanceQueryDialog
          open={false}
          channel={second}
          initialRawResponse='{"source":"second"}'
          onOpenChange={vi.fn()}
        />
      </>
    )
    await screen.findByRole('dialog', { name: 'Query Balance' })
    view.rerender(
      <>
        <BalanceQueryDialog
          open
          channel={first}
          initialRawResponse='{"source":"first"}'
          onOpenChange={vi.fn()}
        />
        <BalanceQueryDialog
          open
          channel={second}
          initialRawResponse='{"source":"second"}'
          onOpenChange={vi.fn()}
        />
      </>
    )
    const secondDialog = screen
      .getAllByRole('dialog')
      .find((dialog) => within(dialog).queryByText('Second balance'))
    assert(secondDialog)
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Update Balance' })
    )
    await waitFor(() =>
      expect(screen.getByText('{"source":"refreshed second"}')).toBeDefined()
    )
    expect(updateChannelBalance).toHaveBeenCalledExactlyOnceWith(402)
    view.rerender(
      <BalanceQueryDialog
        open
        channel={first}
        initialRawResponse='{"source":"first"}'
        onOpenChange={vi.fn()}
      />
    )
    expect(screen.getByText('{"source":"first"}')).toBeVisible()
    expect(screen.queryByText('{"source":"refreshed second"}')).toBeNull()
  })

  it('discards an old result after changing the active channel', async () => {
    const user = userEvent.setup()
    let resolve!: (value: ChannelBalanceResponse) => void
    vi.mocked(updateChannelBalance).mockReturnValue(
      new Promise((complete) => {
        resolve = complete
      })
    )
    const first = { id: 411, name: 'First balance', type: 58 } as Channel
    const second = { id: 412, name: 'Second balance', type: 58 } as Channel
    const view = renderChannelUI(
      <BalanceQueryDialog open channel={first} onOpenChange={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: 'Update Balance' }))
    view.rerender(
      <BalanceQueryDialog
        open
        channel={second}
        initialRawResponse='{"source":"second"}'
        onOpenChange={vi.fn()}
      />
    )
    await act(async () => {
      resolve({ success: true, raw_response: '{"source":"late first"}' })
    })
    expect(screen.getByText('{"source":"second"}')).toBeDefined()
    expect(screen.queryByText('{"source":"late first"}')).toBeNull()
  })
})
