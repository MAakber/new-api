import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'

import { PublicHeader } from '../public-header'

const clients: QueryClient[] = []

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
})

it('keeps the mobile menu inaccessible while closed and exposes official availability in navigation order when opened', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, {})
  client.setQueryData(['notice'], { success: true, data: '' })
  const root = createRootRoute({
    component: () => (
      <PublicHeader
        showThemeSwitch={false}
        showLanguageSwitcher={false}
        showNotifications={false}
        showAuthButtons={false}
      />
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  const toggle = await screen.findByRole('button', {
    name: 'Toggle navigation menu',
  })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const menu = document.querySelector<HTMLElement>(
    `[id="${toggle.getAttribute('aria-controls')}"]`
  )
  if (!menu) throw new Error('The navigation toggle must reference its menu')
  expect(menu).toHaveAttribute('inert')
  await user.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const links = within(menu)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
  expect(links[links.indexOf('/rankings') + 1]).toBe('/official-status')
  expect(menu).toHaveClass('xl:hidden')
  await user.click(toggle)
  expect(menu).toHaveAttribute('aria-hidden', 'true')
})
