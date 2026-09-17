import { beforeEach, describe, expect, test, vi } from 'vitest'

import { getTaskPluginEnabledOption, setTaskPluginEnabledOption } from '../api'

const { get, put } = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  api: {
    get,
    put,
  },
}))

describe('task plugin master switch option', () => {
  beforeEach(() => {
    get.mockReset()
    put.mockReset()
  })

  test('reads TaskPluginEnabled from /api/option/', async () => {
    get.mockResolvedValue({
      data: {
        success: true,
        data: [{ key: 'TaskPluginEnabled', value: 'true' }],
      },
    })

    await expect(getTaskPluginEnabledOption()).resolves.toBe(true)
    expect(get).toHaveBeenCalledWith('/api/option/')
  })

  test('writes TaskPluginEnabled to /api/option/', async () => {
    put.mockResolvedValue({ data: { success: true, data: null } })

    await setTaskPluginEnabledOption(false)
    expect(put).toHaveBeenCalledWith(
      '/api/option/',
      { key: 'TaskPluginEnabled', value: 'false' },
      expect.anything()
    )
  })
})
