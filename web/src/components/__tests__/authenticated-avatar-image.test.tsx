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
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLImageElement',
  'Node',
  'Element',
  'Event',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { Avatar } = await import('@/components/ui/avatar')
const { AuthenticatedAvatarImage } =
  await import('../authenticated-avatar-image')
const { useAuthStore } = await import('@/stores/auth-store')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('AuthenticatedAvatarImage', () => {
  after(() => {
    domWindow.close()
  })

  test('fetches a private avatar with fresh Bearer authentication', async () => {
    const previousFetch = globalThis.fetch
    const previousCreateObjectURL = URL.createObjectURL
    const previousRevokeObjectURL = URL.revokeObjectURL
    const calls: RequestInit[] = []
    let createdObjectUrl = false
    const objectUrl = 'blob:avatar-private'

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      globalThis.fetch = async (_input, init) => {
        calls.push(init ?? {})
        return new Response(new Blob(['image'], { type: 'image/png' }), {
          headers: { 'Content-Type': 'image/png' },
        })
      }
      URL.createObjectURL = () => {
        createdObjectUrl = true
        return objectUrl
      }
      URL.revokeObjectURL = () => undefined
      useAuthStore.getState().auth.setBundle({
        access_token: 'avatar-token',
        token_type: 'Bearer',
        access_expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 1, username: 'avatar-user', role: 1 },
        session: {
          sid: 'avatar-session',
          current: true,
          login_method: 'password',
          ip: '127.0.0.1',
          user_agent: 'test',
          created_at: 1,
          last_active_at: 1,
          expires_at: 3600,
        },
      })
      await act(async () => {
        root.render(
          <Avatar>
            <AuthenticatedAvatarImage
              avatarUrl='/api/user/self/avatar?v=1'
              alt='Profile avatar'
            />
          </Avatar>
        )
      })
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })

      assert.equal(calls.length, 1)
      assert.equal(
        new Headers(calls[0].headers).get('Authorization'),
        'Bearer avatar-token'
      )
      assert.equal(calls[0].credentials, 'include')
      assert.equal(createdObjectUrl, true)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      globalThis.fetch = previousFetch
      URL.createObjectURL = previousCreateObjectURL
      URL.revokeObjectURL = previousRevokeObjectURL
      useAuthStore.getState().auth.reset()
    }
  })
})
