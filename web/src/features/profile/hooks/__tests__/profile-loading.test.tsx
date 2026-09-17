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
