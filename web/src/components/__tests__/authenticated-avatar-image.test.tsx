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
const { Avatar, AvatarFallback } = await import('@/components/ui/avatar')
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

  async function flushAvatarEffects() {
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
  }

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

  test('reuses one in-flight request for concurrent instances with the same URL', async () => {
    const previousFetch = globalThis.fetch
    const previousCreateObjectURL = URL.createObjectURL
    const previousRevokeObjectURL = URL.revokeObjectURL
    const calls: RequestInit[] = []
    let resolveFetch!: (response: Response) => void
    const responsePromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve
    })
    const avatarUrl = '/api/user/self/avatar?v=concurrent'

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      globalThis.fetch = async (_input, init) => {
        calls.push(init ?? {})
        return responsePromise
      }
      URL.createObjectURL = () => 'blob:avatar-concurrent'
      URL.revokeObjectURL = () => undefined
      useAuthStore.getState().auth.setBundle({
        access_token: 'avatar-concurrent-token',
        token_type: 'Bearer',
        access_expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 1, username: 'avatar-user', role: 1 },
        session: {
          sid: 'avatar-concurrent-session',
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
          <>
            <Avatar>
              <AuthenticatedAvatarImage
                avatarUrl={avatarUrl}
                alt='First avatar'
              />
            </Avatar>
            <Avatar>
              <AuthenticatedAvatarImage
                avatarUrl={avatarUrl}
                alt='Second avatar'
              />
            </Avatar>
          </>
        )
      })
      await flushAvatarEffects()

      assert.equal(calls.length, 1)
      resolveFetch(
        new Response(new Blob(['image'], { type: 'image/png' }), {
          headers: { 'Content-Type': 'image/png' },
        })
      )
      await flushAvatarEffects()

      assert.equal(calls.length, 1)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      globalThis.fetch = previousFetch
      URL.createObjectURL = previousCreateObjectURL
      URL.revokeObjectURL = previousRevokeObjectURL
      useAuthStore.getState().auth.reset()
    }
  })

  test('fetches again when the versioned avatar URL changes', async () => {
    const previousFetch = globalThis.fetch
    const previousCreateObjectURL = URL.createObjectURL
    const previousRevokeObjectURL = URL.revokeObjectURL
    const requests: string[] = []
    const revokedObjectUrls: string[] = []
    let objectUrlIndex = 0
    const firstAvatarUrl = '/api/user/self/avatar?v=version-1'
    const secondAvatarUrl = '/api/user/self/avatar?v=version-2'

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      globalThis.fetch = async (input) => {
        requests.push(String(input))
        return new Response(new Blob(['image'], { type: 'image/png' }), {
          headers: { 'Content-Type': 'image/png' },
        })
      }
      URL.createObjectURL = () => `blob:avatar-version-${++objectUrlIndex}`
      URL.revokeObjectURL = (url) => {
        revokedObjectUrls.push(url)
      }
      useAuthStore.getState().auth.setBundle({
        access_token: 'avatar-version-token',
        token_type: 'Bearer',
        access_expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 1, username: 'avatar-user', role: 1 },
        session: {
          sid: 'avatar-version-session',
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
              avatarUrl={firstAvatarUrl}
              alt='Versioned avatar'
            />
          </Avatar>
        )
      })
      await flushAvatarEffects()

      await act(async () => {
        root.render(
          <Avatar>
            <AuthenticatedAvatarImage
              avatarUrl={secondAvatarUrl}
              alt='Versioned avatar'
            />
          </Avatar>
        )
      })
      await flushAvatarEffects()

      assert.deepEqual(requests, [firstAvatarUrl, secondAvatarUrl])
      assert.deepEqual(revokedObjectUrls, ['blob:avatar-version-1'])
    } finally {
      await act(async () => root.unmount())
      container.remove()
      globalThis.fetch = previousFetch
      URL.createObjectURL = previousCreateObjectURL
      URL.revokeObjectURL = previousRevokeObjectURL
      useAuthStore.getState().auth.reset()
    }
  })

  test('keeps the avatar fallback when the authenticated request fails', async () => {
    const previousFetch = globalThis.fetch
    const calls: string[] = []
    const avatarUrl = '/api/user/self/avatar?v=failure'

    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    try {
      globalThis.fetch = async (input) => {
        calls.push(String(input))
        return new Response(null, { status: 404 })
      }
      useAuthStore.getState().auth.setBundle({
        access_token: 'avatar-failure-token',
        token_type: 'Bearer',
        access_expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 1, username: 'avatar-user', role: 1 },
        session: {
          sid: 'avatar-failure-session',
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
              avatarUrl={avatarUrl}
              alt='Failed avatar'
            />
            <AvatarFallback>F</AvatarFallback>
          </Avatar>
        )
      })
      await flushAvatarEffects()

      assert.deepEqual(calls, [avatarUrl])
      assert.equal(
        container.querySelector('[data-slot="avatar-fallback"]')?.textContent,
        'F'
      )
      assert.equal(container.querySelector('[data-slot="avatar-image"]'), null)
    } finally {
      await act(async () => root.unmount())
      container.remove()
      globalThis.fetch = previousFetch
      useAuthStore.getState().auth.reset()
    }
  })
})
