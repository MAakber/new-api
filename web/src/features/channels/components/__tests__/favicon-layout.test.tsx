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

import type { Cell, Row } from '@tanstack/react-table'
import { Window } from 'happy-dom'
import type { ReactNode } from 'react'

import type { Channel } from '../../types'

const domWindow = new Window()
const domGlobals = [
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
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ChannelCard } = await import('../channel-card')
const { ChannelFavicon } = await import('../channel-favicon')
const { useChannelsColumns } = await import('../channels-columns')
const { ChannelsProvider } = await import('../channels-provider')

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
        'Open in new tab': 'Open in new tab',
      },
    },
  },
})

function makeCell(
  id: string,
  content: () => ReactNode
): Cell<Channel, unknown> {
  return {
    column: {
      id,
      columnDef: { cell: content },
    },
    getContext: () => ({}),
  } as unknown as Cell<Channel, unknown>
}

function makeChannelRow(): Row<Channel> {
  const original = {
    id: 1,
    status: 1,
    name: 'Provider channel',
    base_url: 'https://provider.example/api/v1',
    group: 'default',
    setting: null,
  } as Channel
  const cells = [
    makeCell('favicon', () => <ChannelFavicon baseUrl={original.base_url} />),
    makeCell('name', () => <span data-channel-name>{original.name}</span>),
  ]

  return {
    original,
    getAllCells: () => cells,
  } as unknown as Row<Channel>
}

function ColumnOrderProbe() {
  const columns = useChannelsColumns({ enableSelection: false })
  const columnIds = columns.map((column) => {
    if (column.id) {
      return column.id
    }
    if ('accessorKey' in column && column.accessorKey !== undefined) {
      return String(column.accessorKey)
    }
    return ''
  })

  return <div data-column-order={columnIds.join(',')} />
}

async function renderWithChannels(node: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ChannelsProvider>{node}</ChannelsProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
  })

  return { container, root, queryClient }
}

describe('channel favicon layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the favicon column immediately before the name column', async () => {
    const rendered = await renderWithChannels(<ColumnOrderProbe />)
    const order = rendered.container
      .querySelector('[data-column-order]')
      ?.getAttribute('data-column-order')
      ?.split(',')
    assert.ok(order)
    assert.equal(order.indexOf('favicon') + 1, order.indexOf('name'))

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
    rendered.queryClient.clear()
  })

  test('places the shared favicon cell before the channel name in cards', async () => {
    const row = makeChannelRow()
    const rendered = await renderWithChannels(
      <ChannelCard row={row} isSelected={false} />
    )
    const favicon = rendered.container.querySelector('a')
    const name = rendered.container.querySelector('[data-channel-name]')
    assert.ok(favicon)
    assert.ok(name)
    assert.equal(
      Boolean(
        favicon.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING
      ),
      true
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
    rendered.queryClient.clear()
  })
})
