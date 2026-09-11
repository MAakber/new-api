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
import axios from 'axios'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { useAuthStore, type AuthBundle } from '@/stores/auth-store'

import { bootstrapAuthentication, resolveAuthentication } from '../auth-session'

const bundle: AuthBundle = {
  access_token: 'hintless-session-token',
  token_type: 'Bearer',
  access_expires_at: 9999999999,
  user: { id: 23, username: 'returning-user', role: 1 },
  session: {
    sid: 'hintless-session',
    current: true,
    login_method: 'password',
    ip: '127.0.0.1',
    user_agent: 'test',
    created_at: 1,
    last_active_at: 1,
    expires_at: 9999999999,
  },
}

beforeEach(() => {
  useAuthStore.getState().auth.reset('idle')
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('')
})

afterEach(() => {
  useAuthStore.getState().auth.reset('idle')
  vi.restoreAllMocks()
})

it('skips anonymous public refresh but recovers a hintless session when authentication matters', async () => {
  const request = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({
    status: 200,
    data: { success: true, data: bundle },
  })
  expect(await bootstrapAuthentication()).toEqual({ kind: 'anonymous' })
  expect(useAuthStore.getState().auth.bootstrapState).toBe('idle')
  expect(request).not.toHaveBeenCalled()
  expect(await resolveAuthentication()).toEqual({
    kind: 'authenticated',
    bundle,
  })
  expect(request).toHaveBeenCalledTimes(1)
  expect(useAuthStore.getState().auth.session?.sid).toBe('hintless-session')
})

it('does not treat a forged session hint as authentication', async () => {
  vi.spyOn(document, 'cookie', 'get').mockReturnValue('new_api_has_session=1')
  const request = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({
    status: 401,
    data: { success: false },
  })
  expect(await bootstrapAuthentication()).toEqual({ kind: 'anonymous' })
  expect(request).toHaveBeenCalledTimes(1)
  expect(useAuthStore.getState().auth.user).toBeNull()
  expect(useAuthStore.getState().auth.bootstrapState).toBe('complete')
})

it('revalidates an expired in-memory session even when its hint is absent', async () => {
  useAuthStore.getState().auth.setBundle({ ...bundle, access_expires_at: 1 })
  const request = vi.spyOn(axios.Axios.prototype, 'request').mockResolvedValue({
    status: 200,
    data: { success: true, data: bundle },
  })
  expect(await bootstrapAuthentication()).toEqual({
    kind: 'authenticated',
    bundle,
  })
  expect(request).toHaveBeenCalledTimes(1)
  expect(useAuthStore.getState().auth.accessExpiresAt).toBe(9999999999)
})
