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
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { UpstreamUpdateDialog } = await import('../upstream-update-dialog')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

describe('upstream update dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps footer actions visible while long model lists use the mobile body', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <UpstreamUpdateDialog
            open
            addModels={Array.from(
              { length: 40 },
              (_, index) => `add/model-${index}`
            )}
            removeModels={Array.from(
              { length: 40 },
              (_, index) => `remove/model-${index}`
            )}
            preferredTab='add'
            confirmLoading={false}
            onConfirm={() => undefined}
            onCancel={() => undefined}
          />
        </I18nextProvider>
      )
    })

    const content = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]'
    )
    const footer = document.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]'
    )
    const scrollArea = document.querySelector<HTMLElement>(
      '[data-slot="scroll-area"]'
    )
    const tabsList = document.querySelector<HTMLElement>(
      '[data-slot="tabs-list"]'
    )

    assert.ok(content)
    assert.ok(footer)
    assert.ok(scrollArea)
    assert.ok(tabsList)
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
    assert.equal(scrollArea.classList.contains('max-md:h-auto'), true)
    assert.equal(
      scrollArea.classList.contains(
        'max-md:[&_[data-slot=scroll-area-viewport]]:overflow-visible'
      ),
      true
    )
    assert.equal(tabsList.classList.contains('max-md:h-auto'), true)

    await act(async () => root.unmount())
    container.remove()
  })
})
