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
import { createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from '@tanstack/react-router'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Sidebar, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

import { NavGroup } from '../nav-group'

function NavigationFrame() {
  return (
    <SidebarProvider>
      <SidebarTrigger />
      <Sidebar>
        <NavGroup title='Gateway' items={[{ title: 'Pricing', url: '/pricing' }]} />
      </Sidebar>
      <Outlet />
    </SidebarProvider>
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderNavigation(width: number) {
  vi.stubGlobal('innerWidth', width)
  const root = createRootRoute({ component: NavigationFrame })
  const requests: boolean[] = []
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({
        getParentRoute: () => root,
        path: '/pricing',
        loader: ({ preload }) => { requests.push(preload) },
        component: () => <h1>Model pricing</h1>,
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultPreload: 'intent',
  })
  await router.load()
  render(<RouterProvider router={router} />)
  return { router, requests }
}

describe('sidebar navigation', () => {
  it('opens a mobile link on the first tap without running a preload and closes the drawer', async () => {
    const user = userEvent.setup()
    const { requests } = await renderNavigation(390)
    await user.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    const link = await screen.findByRole('link', { name: 'Pricing' })
    fireEvent.touchStart(link)
    await user.click(link)

    expect(await screen.findByRole('heading', { name: 'Model pricing' })).toBeVisible()
    expect(requests).toEqual([false])
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('retains intent preloading for desktop navigation', async () => {
    const { requests } = await renderNavigation(1280)
    fireEvent.focus(screen.getByRole('link', { name: 'Pricing' }))

    await waitFor(() => expect(requests).toEqual([true]))
  })
})
