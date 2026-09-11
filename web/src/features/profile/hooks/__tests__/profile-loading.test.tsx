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
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { useProfile } from '../use-profile'

it('reports a rejected profile response instead of silently showing an empty profile', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: false, message: 'Profile temporarily unavailable' },
  })
  const error = vi.spyOn(toast, 'error')
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.profile).toBeNull()
  expect(error).toHaveBeenCalledWith('Profile temporarily unavailable')
})

it('keeps the loaded profile and stays quiet when a silent refresh is rejected', async () => {
  const profile = { id: 42, username: 'alice', avatar_url: '/avatar/42' }
  vi.spyOn(api, 'get')
    .mockResolvedValueOnce({ data: { success: true, data: profile } })
    .mockResolvedValueOnce({
      data: { success: false, message: 'Profile temporarily unavailable' },
    })
  const error = vi.spyOn(toast, 'error')
  const { result } = renderHook(() => useProfile())
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => result.current.refreshProfile())
  expect(result.current.profile).toEqual(profile)
  expect(error).not.toHaveBeenCalled()
})
