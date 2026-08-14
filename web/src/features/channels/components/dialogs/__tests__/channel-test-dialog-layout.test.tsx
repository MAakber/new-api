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
  'HTMLTextAreaElement',
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
const { ChannelTestDialog } = await import('../channel-test-dialog')
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
  id: 23,
  name: 'Channel test layout channel',
  models: 'provider/short-model,provider/very-long-model-name-that-wraps',
  test_model: 'provider/short-model',
} as Channel

function CurrentChannelDialog() {
  const { setCurrentRow } = useChannels()

  useEffect(() => {
    setCurrentRow(channel)
  }, [setCurrentRow])

  return <ChannelTestDialog open onOpenChange={() => undefined} />
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

describe('channel test dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('shows mobile model cards and keeps batch actions in the dialog flow', async () => {
    const rendered = await renderDialog(<CurrentChannelDialog />)

    const content = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]'
    )
    const footer = document.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]'
    )
    const desktopTable = document.querySelector<HTMLElement>(
      '[role="region"][aria-label="Channel models"]'
    )
    const mobileList = document.querySelector<HTMLElement>(
      '[data-slot="mobile-channel-model-list"]'
    )

    assert.ok(content)
    assert.ok(footer)
    assert.ok(desktopTable)
    assert.ok(mobileList)
    assert.equal(content.classList.contains('max-md:h-[100dvh]'), true)
    assert.equal(
      content.classList.contains('max-md:[&>div:nth-child(2)]:flex-1'),
      true
    )
    assert.equal(
      footer.classList.contains(
        'max-md:!pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
      ),
      true
    )
    assert.equal(footer.querySelectorAll('button').length, 1)
    assert.equal(desktopTable.classList.contains('max-md:hidden'), true)
    assert.equal(mobileList.classList.contains('md:hidden'), true)

    const cards = mobileList.querySelectorAll<HTMLElement>(
      '[data-slot="mobile-channel-model-card"]'
    )
    assert.equal(cards.length, 2)
    for (const card of cards) {
      assert.ok(card.querySelector('[data-slot="checkbox"]'))
      assert.match(card.textContent || '', /Status/)
      assert.match(card.textContent || '', /Result/)
      assert.ok(card.querySelector('button[aria-label="Test Connection"]'))
    }

    const batchButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('Test all 2 models')
    )
    assert.ok(batchButton)

    const firstCheckbox = cards[0]?.querySelector<HTMLElement>(
      '[data-slot="checkbox"]'
    )
    assert.ok(firstCheckbox)
    await act(async () => firstCheckbox.click())

    const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]')
    assert.ok(toolbar)
    assert.equal(toolbar.classList.contains('max-md:static'), true)
    assert.equal(toolbar.classList.contains('max-md:w-full'), true)
    assert.ok(content.contains(toolbar))
    assert.equal(firstCheckbox.getAttribute('aria-checked'), 'true')

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
    rendered.queryClient.clear()
  })
})
