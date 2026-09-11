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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { redemptionSchema, type Redemption } from '../../types'
import { RedemptionsMutateDrawer } from '../redemptions-mutate-drawer'
import { RedemptionsProvider } from '../redemptions-provider'

function redemption(id = 1, overrides: Partial<Redemption> = {}): Redemption {
  return redemptionSchema.parse({
    id,
    user_id: 1,
    name: `code-${id}`,
    key: 'masked',
    status: 1,
    quota: 500001,
    created_time: 1,
    redeemed_time: 0,
    expired_time: 0,
    used_user_id: 0,
    ...overrides,
  })
}

let client: QueryClient
const previousConfig = useSystemConfigStore.getState().config
beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
    },
  })
  client.setQueryData(['admin-subscription-plans'], [])
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: redemption() },
  })
  vi.spyOn(api, 'put').mockResolvedValue({ data: { success: true } })
})
afterEach(() => {
  cleanup()
  client.clear()
  useSystemConfigStore.getState().setConfig(previousConfig)
})

function Wrapper(props: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <RedemptionsProvider>{props.children}</RedemptionsProvider>
    </QueryClientProvider>
  )
}

function renderDrawer(row = redemption()) {
  return render(
    <RedemptionsMutateDrawer open currentRow={row} onOpenChange={vi.fn()} />,
    { wrapper: Wrapper }
  )
}

async function ready() {
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  )
}

test('shows the CNY amount without floating point noise', async () => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7.2,
    },
  })
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: redemption(1, { quota: 13888889 }) },
  })
  renderDrawer()
  await ready()
  expect(screen.getByRole('spinbutton', { name: 'Quota (CNY)' })).toHaveValue(
    200
  )
})

test.each(['network', 'unsuccessful', 'wrong record'])(
  'blocks updates after a %s load failure',
  async (failure) => {
    const error = vi.spyOn(toast, 'error')
    if (failure === 'network')
      vi.mocked(api.get).mockRejectedValue(new Error('network failure'))
    else
      vi.mocked(api.get).mockResolvedValue({
        data: {
          success: failure !== 'unsuccessful',
          data: redemption(2),
          message: 'raw server message',
        },
      })
    renderDrawer()
    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    const name = screen.getByRole('textbox', { name: 'Name' })
    expect(name).toBeDisabled()
    const form = name.closest('form')
    if (!form) throw new Error('Expected redemption form')
    await act(async () => {
      fireEvent.submit(form)
    })
    expect(api.put).not.toHaveBeenCalled()
    expect(screen.queryByText('raw server message')).toBeNull()
  }
)

test.each([
  { name: 'quota redemption', value: redemption() },
  {
    name: 'registration code',
    value: redemption(1, {
      code_type: 'registration',
      max_uses: 5,
      used_count: 3,
    }),
  },
  {
    name: 'subscription redemption',
    value: redemption(1, { reward_type: 'subscription', plan_id: 7 }),
  },
])(
  'keeps exact quota and downstream fields when renaming a $name',
  async ({ value }) => {
    vi.mocked(api.get).mockResolvedValue({
      data: { success: true, data: value },
    })
    renderDrawer(value)
    await ready()
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'renamed' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith(
        '/api/redemption/',
        expect.objectContaining({
          id: value.id,
          name: 'renamed',
          quota: value.quota,
          code_type: value.code_type,
          reward_type: value.reward_type,
          plan_id: value.plan_id,
          max_uses: value.max_uses,
        })
      )
    )
  }
)

test('recalculates quota only when the amount is edited', async () => {
  renderDrawer()
  await ready()
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Quota (USD)' }), {
    target: { value: '2' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/api/redemption/',
      expect.objectContaining({ quota: 1000000 })
    )
  )
})

test('ignores the older request when switching records', async () => {
  let resolveFirst!: (result: {
    data: { success: boolean; data: Redemption }
  }) => void
  const first = new Promise<{ data: { success: boolean; data: Redemption } }>(
    (resolve) => {
      resolveFirst = resolve
    }
  )
  vi.mocked(api.get).mockImplementation((url) =>
    url === '/api/redemption/1'
      ? first
      : Promise.resolve({
          data: { success: true, data: redemption(2, { quota: 1000001 }) },
        })
  )
  const view = renderDrawer()
  expect(screen.getByRole('button', { name: 'Loading...' })).toBeDisabled()
  view.rerender(
    <RedemptionsMutateDrawer
      open
      currentRow={redemption(2)}
      onOpenChange={vi.fn()}
    />
  )
  await ready()
  await act(async () => {
    resolveFirst({ data: { success: true, data: redemption() } })
    await first
  })
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('code-2')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(api.put).toHaveBeenCalledWith(
      '/api/redemption/',
      expect.objectContaining({ id: 2, quota: 1000001 })
    )
  )
})
