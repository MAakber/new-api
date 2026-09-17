import { act, renderHook, waitFor } from '@testing-library/react'
import type { AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { useBillingHistory } from '../use-billing-history'

type PendingRequest = { url: string; reply: (data: unknown) => void }
let originalAdapter: AxiosAdapter | AxiosAdapter[] | undefined
let requests: PendingRequest[]

beforeEach(() => {
  originalAdapter = api.defaults.adapter as typeof originalAdapter
  requests = []
  useAuthStore.getState().auth.reset()
  api.defaults.adapter = (config) =>
    new Promise((resolve) => {
      requests.push({
        url: config.url || '',
        reply: (data) =>
          resolve({ data, config, status: 200, statusText: 'OK', headers: {} }),
      })
    })
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.useRealTimers()
  useAuthStore.getState().auth.reset()
})

describe('billing history search', () => {
  it('sends only the settled keyword and resets pagination after typing', async () => {
    const view = renderHook(() => useBillingHistory({ initialPage: 3 }))
    await waitFor(() => expect(requests).toHaveLength(1))
    await act(async () =>
      requests[0].reply({ success: true, data: { items: [], total: 0 } })
    )
    vi.useFakeTimers()

    act(() => view.result.current.handleSearch('ord'))
    act(() => view.result.current.handleSearch('order-42'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(499)
    })
    expect(requests).toHaveLength(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(requests).toHaveLength(2)
    const query = new URL(requests[1].url, 'https://test.invalid')
    expect(query.searchParams.get('keyword')).toBe('order-42')
    expect(query.searchParams.get('p')).toBe('1')
    await act(async () =>
      requests[1].reply({ success: true, data: { items: [], total: 0 } })
    )
  })

  it('keeps the latest results when an older request finishes last', async () => {
    const view = renderHook(() => useBillingHistory())
    await waitFor(() => expect(requests).toHaveLength(1))
    vi.useFakeTimers()
    act(() => view.result.current.handleSearch('new-order'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(requests).toHaveLength(2)
    await act(async () =>
      requests[1].reply({ success: true, data: { items: [], total: 42 } })
    )
    expect(view.result.current.total).toBe(42)
    expect(view.result.current.loading).toBe(false)

    await act(async () =>
      requests[0].reply({ success: true, data: { items: [], total: 7 } })
    )
    expect(view.result.current.total).toBe(42)
    expect(view.result.current.loading).toBe(false)
  })
})
