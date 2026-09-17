import { AxiosError, type AxiosAdapter } from 'axios'
import { afterEach, expect, it, vi } from 'vitest'

import { api, getNotice } from '../api'

const originalAdapter = api.defaults.adapter

afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

it('public notices keep their existing ETag revalidation policy', async () => {
  const adapter = vi.fn<AxiosAdapter>(async (config) => ({
    data: { success: true, data: 'Public notice' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  }))
  api.defaults.adapter = adapter
  await getNotice()
  expect(adapter.mock.calls[0][0].headers.get('Cache-Control')).toBeNull()
})

it('a retry after 404 revalidates HTTP caches instead of accepting a stored error', async () => {
  const adapter = vi
    .fn<AxiosAdapter>()
    .mockImplementationOnce(async (config) => {
      throw new AxiosError('Not Found', 'ERR_BAD_REQUEST', config, undefined, {
        data: { error: { message: 'Invalid URL' } },
        status: 404,
        statusText: 'Not Found',
        headers: {},
        config,
      })
    })
    .mockImplementationOnce(async (config) => ({
      data: { success: true, data: { exists: false } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    }))
  api.defaults.adapter = adapter
  const config = { skipErrorHandler: true }
  await expect(api.get('/api/user/token/status', config)).rejects.toMatchObject(
    { response: { status: 404 } }
  )
  const response = await api.get('/api/user/token/status', config)
  expect(response.data.data.exists).toBe(false)
  expect(adapter).toHaveBeenCalledTimes(2)
  for (const [request] of adapter.mock.calls) {
    const directives = String(request.headers.get('Cache-Control'))
      .split(',')
      .map((value: string) => value.trim())
    expect(directives).toContain('no-cache')
    expect(directives).toContain('no-store')
  }
})
