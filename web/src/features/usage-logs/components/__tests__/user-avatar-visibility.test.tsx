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

import type { Cell, ColumnDef, Row, Table } from '@tanstack/react-table'
import { Window } from 'happy-dom'
import type React from 'react'

import type { UsageLog } from '../../data/schema'
import type { TaskLog } from '../../types'

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'localStorage',
  'matchMedia',
  'customElements',
  'HTMLElement',
  'HTMLImageElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
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

const { act, useEffect } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { useAuthStore } = await import('@/stores/auth-store')
const {
  UsageLogsProvider,
  useUsageLogsContext,
} = await import('../usage-logs-provider')
const { useCommonLogsColumns } = await import('../columns/common-logs-columns')
const { useTaskLogsColumns } = await import('../columns/task-logs-columns')
const { UsageLogsMobileList } = await import('../usage-logs-mobile-card')

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
        User: 'User',
        Time: 'Time',
        Channel: 'Channel',
        'Submit Time': 'Submit Time',
        'Task ID': 'Task ID',
        Status: 'Status',
        Details: 'Details',
        Duration: 'Duration',
        Progress: 'Progress',
        Result: 'Result',
      },
    },
  },
})

function makeUsageLog(userId: number, username: string): UsageLog {
  return {
    id: userId,
    user_id: userId,
    created_at: 1,
    type: 0,
    content: '',
    username,
    token_name: '',
    model_name: 'test-model',
    quota: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    use_time: 0,
    is_stream: false,
    channel: 1,
    channel_name: '',
    token_id: 0,
    group: '',
    ip: '',
    other: '',
    request_id: '',
    upstream_request_id: '',
  }
}

const taskLog: TaskLog = {
  id: 102,
  user_id: 102,
  username: 'Task user',
  platform: 'suno',
  task_id: 'task-1',
  action: 'MUSIC',
  channel_id: 1,
  submit_time: 1,
  status: 'SUCCESS',
}

function makeRow<T>(original: T): Row<T> {
  return { original } as unknown as Row<T>
}

function RenderUserCell<T>({
  column,
  row,
}: {
  column: ColumnDef<T>
  row: Row<T>
}) {
  if (typeof column.cell !== 'function') {
    throw new Error('User column renderer is missing')
  }

  const Cell = column.cell as React.ComponentType<{ row: Row<T> }>
  return <Cell row={row} />
}

function CommonUserProbe({ log, label }: { log: UsageLog; label: string }) {
  const columns = useCommonLogsColumns(true)
  const userColumn = columns.find((column) => column.id === 'user')
  if (!userColumn) throw new Error('Common user column is missing')

  return (
    <div data-avatar-case={label}>
      <RenderUserCell column={userColumn} row={makeRow(log)} />
    </div>
  )
}

function TaskUserProbe({ log, label }: { log: TaskLog; label: string }) {
  const columns = useTaskLogsColumns(true)
  const userColumn = columns.find((column) => column.id === 'user')
  if (!userColumn) throw new Error('Task user column is missing')

  return (
    <div data-avatar-case={label}>
      <RenderUserCell column={userColumn} row={makeRow(log)} />
    </div>
  )
}

function makeMobileTable(log: UsageLog): Table<UsageLog> {
  let cells: Cell<UsageLog, unknown>[] = []
  const row = {
    id: 'mobile-row',
    original: log,
    getVisibleCells: () => cells,
  } as unknown as Row<UsageLog>

  const makeCell = (id: string): Cell<UsageLog, unknown> =>
    ({
      id,
      column: { id, columnDef: {} },
      row,
      getContext: () => ({ row }),
      getValue: () => undefined,
    }) as unknown as Cell<UsageLog, unknown>

  cells = [makeCell('created_at'), makeCell('user')]

  return {
    getRowModel: () => ({ rows: [row] }),
  } as unknown as Table<UsageLog>
}

function MobileUserProbe({ log, label }: { log: UsageLog; label: string }) {
  return (
    <div data-avatar-case={label}>
      <UsageLogsMobileList
        table={makeMobileTable(log)}
        logCategory='common'
      />
    </div>
  )
}

function SensitiveVisibilityGate({
  visible,
  children,
}: {
  visible: boolean
  children: React.ReactNode
}) {
  const { sensitiveVisible, setSensitiveVisible } = useUsageLogsContext()

  useEffect(() => {
    if (sensitiveVisible !== visible) setSensitiveVisible(visible)
  }, [sensitiveVisible, setSensitiveVisible, visible])

  if (sensitiveVisible !== visible) return null
  return children
}

function AvatarViews({ visible }: { visible: boolean }) {
  return (
    <I18nextProvider i18n={i18n}>
      <UsageLogsProvider>
        <SensitiveVisibilityGate visible={visible}>
          <CommonUserProbe
            label='common'
            log={makeUsageLog(101, 'Common user')}
          />
          <TaskUserProbe label='task' log={taskLog} />
          <MobileUserProbe
            label='mobile'
            log={makeUsageLog(103, 'Mobile user')}
          />
          <CommonUserProbe
            label='invalid'
            log={makeUsageLog(0, 'Invalid user')}
          />
        </SensitiveVisibilityGate>
      </UsageLogsProvider>
    </I18nextProvider>
  )
}

function setValidAuthSession() {
  useAuthStore.getState().auth.setBundle({
    access_token: 'usage-logs-avatar-token',
    token_type: 'Bearer',
    access_expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: 1, username: 'admin', role: 100 },
    session: {
      sid: 'usage-logs-avatar-session',
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

async function renderAvatarViews(visible: boolean) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)

  await act(async () => {
    root.render(<AvatarViews visible={visible} />)
  })

  return { container, root }
}

async function flushAvatarEffects() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('usage log user avatar visibility', () => {
  after(() => {
    domWindow.close()
  })

  test('requests visible user avatars and preserves the fallback when loading fails', async () => {
    const previousFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = async (input) => {
      requests.push(String(input))
      return new Response(null, { status: 404 })
    }
    setValidAuthSession()

    const rendered = await renderAvatarViews(true)
    try {
      await flushAvatarEffects()

      assert.deepEqual([...requests].sort(), [
        '/api/user/101/avatar',
        '/api/user/102/avatar',
        '/api/user/103/avatar',
      ])
      assert.equal(
        rendered.container.querySelector('[data-avatar-case="invalid"] [data-slot="avatar-fallback"]')
          ?.textContent,
        'I'
      )
      for (const [label, fallback] of [
        ['common', 'C'],
        ['task', 'T'],
        ['mobile', 'M'],
      ]) {
        assert.equal(
          rendered.container.querySelector(
            `[data-avatar-case="${label}"] [data-slot="avatar-fallback"]`
          )?.textContent,
          fallback
        )
      }
    } finally {
      await act(async () => rendered.root.unmount())
      rendered.container.remove()
      globalThis.fetch = previousFetch
      useAuthStore.getState().auth.reset()
    }
  })

  test('does not request avatars and keeps anonymous fallbacks when sensitive details are hidden', async () => {
    const previousFetch = globalThis.fetch
    const requests: string[] = []
    globalThis.fetch = async (input) => {
      requests.push(String(input))
      return new Response(null, { status: 200 })
    }
    setValidAuthSession()

    const rendered = await renderAvatarViews(false)
    try {
      await flushAvatarEffects()

      assert.deepEqual(requests, [])
      for (const label of ['common', 'task', 'mobile', 'invalid']) {
        const view = rendered.container.querySelector(
          `[data-avatar-case="${label}"]`
        )
        assert.ok(view)
        assert.equal(
          view.querySelector('[data-slot="avatar-fallback"]')?.textContent,
          '•'
        )
        assert.equal(view.textContent?.includes('••••'), true)
      }
    } finally {
      await act(async () => rendered.root.unmount())
      rendered.container.remove()
      globalThis.fetch = previousFetch
      useAuthStore.getState().auth.reset()
    }
  })
})
