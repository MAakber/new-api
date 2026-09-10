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
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let client: QueryClient

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

afterEach(() => {
  client.clear()
})

async function setupRouter(responses: (boolean | Error)[]) {
  const { api } = await import('@/lib/api')
  const { useAuthStore } = await import('@/stores/auth-store')
  useAuthStore.getState().auth.setBootstrapState('complete')
  const request = vi.spyOn(api, 'get').mockImplementation(async (url) => {
    expect(url).toBe('/api/setup')
    const status = responses.shift()
    if (status instanceof Error) throw status
    if (status === undefined) throw new Error('Unexpected extra setup request')
    return { data: { success: true, data: { status } } }
  })
  const { Route } = await import('../__root')
  const routeTree = Route.addChildren([
    createRoute({ getParentRoute: () => Route, path: '/' }),
    createRoute({ getParentRoute: () => Route, path: '/pricing' }),
    createRoute({ getParentRoute: () => Route, path: '/setup' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: { queryClient: client },
  })
  await router.load()
  return { router, request }
}

describe('setup status routing', () => {
  it('rechecks the current server despite a completed status saved by an earlier page', async () => {
    localStorage.setItem('setup_status_checked', 'true')
    const { router, request } = await setupRouter([false])

    expect(request).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/setup')
  })

  it('retries on the next navigation after a failed setup request', async () => {
    const { router, request } = await setupRouter([new Error('Network unavailable'), false])
    await router.navigate({ to: '/pricing' })

    expect(request).toHaveBeenCalledTimes(2)
    expect(router.state.location.pathname).toBe('/setup')
  })

  it('reuses a successful check during navigation in the same page', async () => {
    const { router, request } = await setupRouter([true])
    await router.navigate({ to: '/pricing' })

    expect(request).toHaveBeenCalledTimes(1)
    expect(router.state.location.pathname).toBe('/pricing')
  })
})
