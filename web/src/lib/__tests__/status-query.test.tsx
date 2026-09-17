import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { useStatus } from '@/hooks/use-status'
import { api } from '@/lib/api'
import {
  getModuleAccessForGuard,
  type HeaderNavModule,
} from '@/lib/nav-modules'
import {
  STATUS_QUERY_KEY,
  readCachedStatus,
  ensureStatus,
  statusQueryOptions,
} from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

/**
 * Guards the deduplication contract of the shared `['status']` query: several
 * independent consumers asking for status must cost one `/api/status` request.
 */

type ApiMethod = (url: string) => Promise<{ data: unknown }>
type MockableApi = { get: ApiMethod }

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get

let statusRequests: string[] = []
const queryClients: QueryClient[] = []

/** Count `/api/status` calls at the network boundary and serve `system_name`. */
function stubStatusEndpoint(systemName: string): void {
  apiClient.get = async (url) => {
    if (url !== '/api/status') throw new Error(`Unexpected GET ${url}`)
    statusRequests.push(url)
    return { data: { success: true, data: { system_name: systemName } } }
  }
}

function createQueryClient(): QueryClient {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClients.push(queryClient)
  return queryClient
}

function wrapper(queryClient: QueryClient) {
  return function QueryWrapper(props: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    )
  }
}

beforeEach(() => {
  statusRequests = []
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  cleanup()
  queryClients.splice(0).forEach((client) => client.clear())
  apiClient.get = originalGet
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

describe('shared status query deduplication', () => {
  test('retains downstream theme and custom currency when shared status refreshes', async () => {
    const queryClient = createQueryClient()
    let status = {
      default_theme: { mode: 'dark', preset: 'anthropic', sidebar_open: false },
      quota_display_type: 'CUSTOM',
      custom_currency_symbol: 'SG$',
      custom_currency_exchange_rate: '1.35',
    }
    apiClient.get = async () => ({ data: { success: true, data: status } })
    await ensureStatus(queryClient)
    expect(useSystemConfigStore.getState().config.defaultTheme).toMatchObject({
      mode: 'dark',
      preset: 'anthropic',
      sidebarOpen: false,
    })
    expect(useSystemConfigStore.getState().config.currency).toMatchObject({
      quotaDisplayType: 'CUSTOM',
      customCurrencySymbol: 'SG$',
      customCurrencyExchangeRate: 1.35,
    })
    expect(readCachedStatus()).toEqual(status)
    status = {
      ...status,
      default_theme: { mode: 'light', preset: 'default', sidebar_open: true },
    }
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY })
    await queryClient.fetchQuery(statusQueryOptions)
    expect(useSystemConfigStore.getState().config.defaultTheme).toMatchObject({
      mode: 'light',
      preset: 'default',
      sidebarOpen: true,
    })
    expect(readCachedStatus()).toEqual(status)
  })

  test.each(['cold', 'stale'] as const)(
    'deduplicates %s cache requests across guards and hook consumers',
    async (cacheState) => {
      const queryClient = createQueryClient()
      if (cacheState === 'stale') {
        queryClient.setQueryData(
          STATUS_QUERY_KEY,
          {
            system_name: 'old',
            HeaderNavModules: { pricing: false, rankings: false },
          },
          { updatedAt: Date.now() - 600_000 }
        )
      }
      const status = {
        system_name: 'shared',
        HeaderNavModules: {
          pricing: { enabled: true, requireAuth: true },
          rankings: { enabled: true, requireAuth: false },
        },
      }
      let resolveStatus!: (value: { data: unknown }) => void
      const response = new Promise<{ data: unknown }>((resolve) => {
        resolveStatus = resolve
      })
      apiClient.get = (url) => {
        statusRequests.push(url)
        return response
      }
      let guardsResolved = false
      const guards = Promise.all([
        getModuleAccessForGuard(queryClient, 'pricing'),
        getModuleAccessForGuard(queryClient, 'rankings'),
      ]).then((result) => {
        guardsResolved = true
        return result
      })
      const hook = renderHook(() => useStatus(), {
        wrapper: wrapper(queryClient),
      })
      await waitFor(() => expect(statusRequests).toEqual(['/api/status']))
      expect(guardsResolved).toBe(false)
      resolveStatus({ data: { success: true, data: status } })
      expect(await guards).toEqual([
        { enabled: true, requireAuth: true },
        { enabled: true, requireAuth: false },
      ])
      await waitFor(() =>
        expect(hook.result.current.status?.system_name).toBe('shared')
      )
      expect(statusRequests).toHaveLength(1)
    }
  )

  test('resolves a later consumer from the warm cache without a second request', async () => {
    stubStatusEndpoint('warm')
    const queryClient = createQueryClient()

    await ensureStatus(queryClient)
    const second = await ensureStatus(queryClient)

    expect(second?.system_name).toBe('warm')
    expect(statusRequests).toHaveLength(1)
  })

  test('returns a stale entry immediately and refreshes it in the background', async () => {
    stubStatusEndpoint('refreshed')
    const queryClient = createQueryClient()
    const staleTime = statusQueryOptions.staleTime as number
    queryClient.setQueryData(
      STATUS_QUERY_KEY,
      { system_name: 'stale' },
      {
        updatedAt: Date.now() - staleTime - 1,
      }
    )

    const resolved = await ensureStatus(queryClient)

    expect(resolved?.system_name).toBe('stale')
    await waitFor(() => {
      expect(
        queryClient.getQueryData<Record<string, unknown>>(STATUS_QUERY_KEY)
          ?.system_name
      ).toBe('refreshed')
    })
    expect(statusRequests).toHaveLength(1)
  })
})

describe('module guard status freshness', () => {
  test.each([
    {
      module: 'pricing',
      before: { enabled: false, requireAuth: false },
      after: { enabled: true, requireAuth: false },
    },
    {
      module: 'rankings',
      before: { enabled: true, requireAuth: false },
      after: { enabled: false, requireAuth: false },
    },
    {
      module: 'pricing',
      before: { enabled: true, requireAuth: false },
      after: { enabled: true, requireAuth: true },
    },
    {
      module: 'rankings',
      before: { enabled: true, requireAuth: true },
      after: { enabled: true, requireAuth: false },
    },
  ])('uses refreshed $module access: $before -> $after', async (scenario) => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(
      STATUS_QUERY_KEY,
      { HeaderNavModules: { [scenario.module]: scenario.before } },
      { updatedAt: Date.now() - 600_000 }
    )
    apiClient.get = async () => ({
      data: {
        success: true,
        data: { HeaderNavModules: { [scenario.module]: scenario.after } },
      },
    })
    expect(
      await getModuleAccessForGuard(
        queryClient,
        scenario.module as HeaderNavModule
      )
    ).toEqual(scenario.after)
  })

  test('reuses fresh access but refreshes explicitly invalidated access', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(STATUS_QUERY_KEY, {
      HeaderNavModules: { pricing: false },
    })
    stubStatusEndpoint('updated')
    expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
      enabled: false,
      requireAuth: false,
    })
    expect(statusRequests).toHaveLength(0)
    await queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY })
    expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
      enabled: true,
      requireAuth: false,
    })
    expect(statusRequests).toHaveLength(1)
  })

  test.each(['cold', 'stale'] as const)(
    'fails closed when a %s cache request fails',
    async (cacheState) => {
      const queryClient = createQueryClient()
      if (cacheState === 'stale') {
        queryClient.setQueryData(
          STATUS_QUERY_KEY,
          { HeaderNavModules: { pricing: true } },
          { updatedAt: Date.now() - 600_000 }
        )
      }
      apiClient.get = async () => {
        throw new Error('Status unavailable')
      }
      expect(await getModuleAccessForGuard(queryClient, 'pricing')).toEqual({
        enabled: false,
        requireAuth: true,
      })
    }
  )
})
