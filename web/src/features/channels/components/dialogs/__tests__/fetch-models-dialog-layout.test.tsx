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

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { FetchModelsDialog } = await import('../fetch-models-dialog')
const { ChannelsProvider } = await import('../../channels-provider')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

describe('fetch models dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps mobile actions and selection status outside the model scroll', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const models = [
      'provider/very-long-model-name-that-must-wrap-without-horizontal-overflow',
      'provider/second-model',
    ]
    let resolveFetch: ((value: string[]) => void) | undefined
    const customFetcher = () =>
      new Promise<string[]>((resolve) => {
        resolveFetch = resolve
      })

    await act(async () => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ChannelsProvider>
              <FetchModelsDialog
                open
                onOpenChange={() => undefined}
                customFetcher={customFetcher}
              />
            </ChannelsProvider>
          </I18nextProvider>
        </QueryClientProvider>
      )
    })

    assert.ok(resolveFetch)
    await act(async () => {
      resolveFetch?.(models)
      await Promise.resolve()
    })

    const content = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]'
    )
    const footer = document.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]'
    )
    const tabsList = document.querySelector<HTMLElement>(
      '[data-slot="tabs-list"]'
    )
    const modelPanel = document.querySelector<HTMLElement>(
      '[data-slot="tabs-content"]'
    )

    assert.ok(content)
    assert.ok(footer)
    assert.ok(tabsList)
    assert.ok(modelPanel)
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
    assert.equal(footer.querySelectorAll('button').length, 2)
    assert.match(footer.textContent || '', /model\(s\) selected/)
    assert.equal(tabsList.classList.contains('max-md:h-auto'), true)
    assert.equal(modelPanel.classList.contains('max-md:overflow-visible'), true)

    await act(async () => root.unmount())
    container.remove()
    queryClient.clear()
  })
})
