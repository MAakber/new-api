import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFetchModelPreferences } from '../fetch-model-preferences-store'

beforeEach(() => {
  useFetchModelPreferences.setState({ types: [] })
  localStorage.clear()
})

describe('fetch model type preferences', () => {
  it('restores only the chosen types after rehydration', async () => {
    useFetchModelPreferences.getState().setTypes(['image', 'video'])
    const saved = localStorage.getItem('fetch-models-preferences:v1') ?? ''
    expect(saved).not.toBe('')
    expect(JSON.parse(saved).state).toEqual({ types: ['image', 'video'] })

    useFetchModelPreferences.setState({ types: [] })
    localStorage.setItem('fetch-models-preferences:v1', saved)
    await useFetchModelPreferences.persist.rehydrate()
    expect(useFetchModelPreferences.getState().types).toEqual([
      'image',
      'video',
    ])
  })

  it('discards unknown and duplicate types when restoring older browser data', async () => {
    localStorage.setItem(
      'fetch-models-preferences:v1',
      JSON.stringify({
        state: { types: ['video', 'obsolete', 'video', 'image'] },
        version: 1,
      })
    )
    await useFetchModelPreferences.persist.rehydrate()
    expect(useFetchModelPreferences.getState().types).toEqual([
      'image',
      'video',
    ])
  })

  it.each([
    '{"state":{"types":"image"},"version":1}',
    '{"state":{"types":["unknown"]},"version":1}',
    '{broken-json',
  ])(
    'keeps the default All filter when saved data is invalid: %s',
    async (saved) => {
      localStorage.setItem('fetch-models-preferences:v1', saved)
      await useFetchModelPreferences.persist.rehydrate()
      expect(useFetchModelPreferences.getState().types).toEqual([])
    }
  )

  it('keeps filters usable when the browser rejects storage writes', () => {
    const blocked = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('Storage is unavailable', 'QuotaExceededError')
      })
    try {
      expect(() =>
        useFetchModelPreferences.getState().setTypes(['audio'])
      ).not.toThrow()
      expect(useFetchModelPreferences.getState().types).toEqual(['audio'])
    } finally {
      blocked.mockRestore()
    }
  })

  it('defaults to All when the browser rejects storage reads', async () => {
    const blocked = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new DOMException('Storage is unavailable', 'SecurityError')
      })
    try {
      await useFetchModelPreferences.persist.rehydrate()
      expect(useFetchModelPreferences.getState().types).toEqual([])
    } finally {
      blocked.mockRestore()
    }
  })
})
