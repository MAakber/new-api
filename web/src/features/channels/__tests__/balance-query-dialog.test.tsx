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
