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
import type { ReactNode } from 'react'

import type { Channel } from '../../../types'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'matchMedia',
  'customElements',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
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

const { act, useEffect } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { api } = await import('../../../../../lib/http-client')
const { MultiKeyManageDialog } = await import('../multi-key-manage-dialog')
const { ChannelsProvider, useChannels } =
  await import('../../channels-provider')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const channel = {
  id: 17,
  name: 'Layout test channel',
  channel_info: { multi_key_mode: 'random' },
} as Channel

function CurrentChannelDialog() {
  const { setCurrentRow } = useChannels()

  useEffect(() => {
    setCurrentRow(channel)
  }, [setCurrentRow])

  return <MultiKeyManageDialog open onOpenChange={() => undefined} />
}

async function renderDialog(node: ReactNode) {
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

describe('multi-key management dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('wraps the toolbar and confines the table scroll on narrow screens', async () => {
    const originalPost = api.post
    const originalGet = api.get
    api.post = (async () => ({
      data: {
        success: true,
        data: {
          keys: [{ index: 0, status: 1, reason: '', disabled_time: 0 }],
          total: 1,
          page: 1,
          page_size: 10,
          total_pages: 1,
          enabled_count: 1,
          manual_disabled_count: 0,
          auto_disabled_count: 0,
        },
      },
    })) as typeof api.post
    api.get = (async () => ({
      data: { success: true, data: { enabled: false } },
    })) as typeof api.get

    try {
      const rendered = await renderDialog(<CurrentChannelDialog />)
      const content = document.querySelector<HTMLElement>(
        '[data-slot="dialog-content"]'
      )

      assert.ok(content)
      const toolbar = [...content.querySelectorAll('div')].find(
        (element) =>
          element.classList.contains('shrink-0') &&
          element.classList.contains('flex-wrap')
      )
      const tableContainer = content.querySelector<HTMLElement>(
        '.min-w-0.flex-1.overflow-auto'
      )
      const table = content.querySelector<HTMLTableElement>('table')

      assert.ok(toolbar)
      assert.ok(tableContainer)
      assert.ok(table)
      assert.equal(toolbar.classList.contains('gap-2'), true)
      assert.equal(tableContainer.classList.contains('min-w-0'), true)
      assert.equal(table.classList.contains('min-w-full'), true)
      assert.equal(table.classList.contains('md:min-w-[800px]'), true)

      await act(async () => rendered.root.unmount())
      rendered.container.remove()
      rendered.queryClient.clear()
    } finally {
      api.post = originalPost
      api.get = originalGet
    }
  })
})
