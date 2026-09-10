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
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { UserAuthForm } from '../user-auth-form'

const originalAdapter = api.defaults.adapter
let widgets: { verify: (token: string) => void; expire: () => void }[]
let submissions: string[]
let queryClient: QueryClient

beforeEach(() => {
  widgets = []
  submissions = []
  useAuthStore.getState().auth.reset()
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData(['status'], {
    turnstile_check: true,
    turnstile_site_key: 'test-site',
    password_login_enabled: true,
  })
  window.turnstile = {
    render: (_element, options) => {
      widgets.push({
        verify: options.callback as (token: string) => void,
        expire: options['expired-callback'] as () => void,
      })
    },
  }
  api.defaults.adapter = async (config) => {
    submissions.push(config.url || '')
    return {
      data: { success: false, message: 'Incorrect credentials' },
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  queryClient.clear()
  delete window.turnstile
  useAuthStore.getState().auth.reset()
})

async function renderLogin() {
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/sign-in',
    component: UserAuthForm,
  })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/sign-in'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.type(
    await screen.findByPlaceholderText('Enter your username or email'),
    'test-user'
  )
  await user.type(
    screen.getByPlaceholderText('Enter password'),
    'test-password'
  )
  await waitFor(() => expect(widgets.length).toBeGreaterThan(0))
  return user
}

describe('password login Turnstile lifecycle', () => {
  it('submits the solved token once and requires a fresh token for a retry', async () => {
    const user = await renderLogin()
    act(() => widgets[0].verify('first-token'))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(submissions).toHaveLength(1))
    expect(submissions[0]).toContain('turnstile=first-token')
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement)
          .disabled
      ).toBe(false)
    )
    expect(widgets.length).toBeGreaterThan(1)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(submissions).toHaveLength(1)

    act(() => widgets.at(-1)?.verify('second-token'))
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(submissions).toHaveLength(2))
    expect(submissions[1]).toContain('turnstile=second-token')
  })

  it('does not submit a token after the provider reports that it expired', async () => {
    const user = await renderLogin()
    act(() => widgets[0].verify('expired-token'))
    act(() => widgets.at(-1)?.expire())
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(submissions).toHaveLength(0)
  })
})
