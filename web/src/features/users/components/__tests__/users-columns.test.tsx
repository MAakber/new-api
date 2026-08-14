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
*/
import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import type { Cell, ColumnDef, Row } from '@tanstack/react-table'
import { Window } from 'happy-dom'

import type { User } from '../../types'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLImageElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { CardRowContent } =
  await import('@/components/data-table/layout/card-row-content')
const { useAuthStore } = await import('@/stores/auth-store')
const { useUsersColumns } = await import('../users-columns')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Username: 'Username',
      },
    },
  },
})

const user: User = {
  id: 42,
  username: 'Ada Lovelace',
  display_name: 'Ada Lovelace',
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
  status: 1,
  role: 1,
}

function makeUserRow(currentUser: User, column: ColumnDef<User>): Row<User> {
  let cells: Cell<User, unknown>[] = []
  const row = {
    original: currentUser,
    getValue: (id: string) =>
      id === 'username' ? currentUser.username : undefined,
    getVisibleCells: () => cells,
  } as unknown as Row<User>

  const cell = {
    id: 'username',
    column: {
      id: 'username',
      columnDef: column,
    },
    getContext: () => ({ row }),
    getValue: () => currentUser.username,
  } as unknown as Cell<User, unknown>
  cells = [cell]
  return row
}

function UsernameCardProbe(props: { currentUser: User }) {
  const columns = useUsersColumns()
  const usernameColumn = columns.find(
    (column) =>
      column.id === 'username' ||
      ('accessorKey' in column && column.accessorKey === 'username')
  )
  if (!usernameColumn) {
    throw new Error('Username column is missing')
  }

  const row = makeUserRow(props.currentUser, usernameColumn)
  return (
    <div data-mobile-title={String(Boolean(usernameColumn.meta?.mobileTitle))}>
      <CardRowContent row={row} compact />
    </div>
  )
}

function setValidAuthSession() {
  useAuthStore.getState().auth.setBundle({
    access_token: 'users-columns-token',
    token_type: 'Bearer',
    access_expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 1, username: 'admin', role: 100 },
    session: {
      sid: 'users-columns-session',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: 'test',
      created_at: 1,
      last_active_at: 1,
      expires_at: 3600,
    },
  })
}

test('renders the username avatar in the mobile title with a 404 fallback', async () => {
  const previousFetch = globalThis.fetch
  const requests: string[] = []
  globalThis.fetch = async (input) => {
    requests.push(String(input))
    return new Response(null, { status: 404 })
  }
  setValidAuthSession()

  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  try {
    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <UsernameCardProbe currentUser={user} />
        </I18nextProvider>
      )
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    assert.equal(
      container
        .querySelector('[data-mobile-title]')
        ?.getAttribute('data-mobile-title'),
      'true'
    )
    assert.deepEqual(requests, ['/api/user/42/avatar'])

    const avatar = container.querySelector('[data-slot="avatar"]')
    const fallback = container.querySelector('[data-slot="avatar-fallback"]')
    assert.ok(avatar)
    assert.equal(fallback?.textContent, 'A')
    assert.equal(avatar.closest('a, button'), null)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    globalThis.fetch = previousFetch
    useAuthStore.getState().auth.reset()
  }
})

after(() => {
  domWindow.close()
})
