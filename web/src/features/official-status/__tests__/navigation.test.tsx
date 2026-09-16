import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import {
  parseHeaderNavModules as parseSettings,
  serializeHeaderNavModules,
} from '@/features/system-settings/maintenance/config'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { api } from '@/lib/api'
import {
  getModuleAccessForGuard,
  parseHeaderNavModules,
} from '@/lib/nav-modules'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { Route } from '@/routes/official-status'
import { useAuthStore } from '@/stores/auth-store'

const clients: QueryClient[] = []

function navigation(config?: unknown, authenticated = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, { HeaderNavModules: config })
  useAuthStore
    .getState()
    .auth.setUser(authenticated ? { id: 1, username: 'viewer', role: 1 } : null)
  const wrapper = (props: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{props.children}</QueryClientProvider>
  )
  return { client, ...renderHook(useTopNavLinks, { wrapper }) }
}

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  useAuthStore.getState().auth.reset()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

it('inserts the public official availability link immediately after Rankings by default', () => {
  const { result } = navigation()
  const rankings = result.current.findIndex((link) => link.href === '/rankings')
  expect(result.current[rankings + 1]).toMatchObject({
    href: '/official-status',
    requiresAuth: false,
  })
})

it.each(['30', '%2230%22'])(
  'accepts a bookmarked 30-day window encoded as %s',
  async (days) => {
    const root = createRootRoute()
    const page = createRoute({
      getParentRoute: () => root,
      path: '/official-status',
      validateSearch: Route.options.validateSearch,
    })
    const router = createRouter({
      routeTree: root.addChildren([page]),
      history: createMemoryHistory({
        initialEntries: [`/official-status?days=${days}`],
      }),
    })
    await router.load()
    expect(router.state.matches.at(-1)?.search).toMatchObject({ days: 30 })
  }
)

it.each([false, { enabled: false, requireAuth: false }])(
  'hides a disabled module and rejects it in the route guard',
  async (setting) => {
    const { result, client } = navigation({ official_status: setting })
    expect(
      result.current.some((link) => link.href === '/official-status')
    ).toBe(false)
    expect(
      await getModuleAccessForGuard(client, 'official_status')
    ).toMatchObject({ enabled: false })
  }
)

it.each([false, true])(
  'applies the login requirement to navigation and the route guard for authenticated=%s',
  async (authenticated) => {
    const { result, client } = navigation(
      { official_status: { enabled: true, requireAuth: true } },
      authenticated
    )
    expect(
      result.current.find((link) => link.href === '/official-status')
        ?.requiresAuth
    ).toBe(!authenticated)
    expect(await getModuleAccessForGuard(client, 'official_status')).toEqual({
      enabled: true,
      requireAuth: true,
    })
  }
)

it('preserves official availability permissions when the settings configuration is serialized', () => {
  const config = parseSettings(
    '{"official_status":{"enabled":true,"requireAuth":true}}'
  )
  expect(
    parseHeaderNavModules(serializeHeaderNavModules(config)).official_status
  ).toEqual({ enabled: true, requireAuth: true })
  expect(parseSettings('').official_status).toEqual({
    enabled: true,
    requireAuth: false,
  })
})

it('fails closed when navigation permissions cannot be refreshed', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
  expect(await getModuleAccessForGuard(client, 'official_status')).toEqual({
    enabled: false,
    requireAuth: true,
  })
})
