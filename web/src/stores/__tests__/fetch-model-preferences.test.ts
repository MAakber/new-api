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
