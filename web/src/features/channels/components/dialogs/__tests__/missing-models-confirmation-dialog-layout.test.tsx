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
  'HTMLElement',
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
const { MissingModelsConfirmationDialog } =
  await import('../missing-models-confirmation-dialog')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

describe('missing models confirmation dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps actions visible while a long model list scrolls on mobile', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <MissingModelsConfirmationDialog
            open
            missingModels={Array.from(
              { length: 80 },
              (_, index) => `provider/model-${index + 1}`
            )}
            onConfirm={() => undefined}
          />
        </I18nextProvider>
      )
    })

    const content = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-content"]'
    )
    const description = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-description"]'
    )
    const footer = document.querySelector<HTMLElement>(
      '[data-slot="alert-dialog-footer"]'
    )

    assert.ok(content)
    assert.ok(description)
    assert.ok(footer)
    assert.equal(
      content.classList.contains('max-sm:grid-rows-[minmax(0,1fr)_auto]'),
      true
    )
    assert.equal(
      content.classList.contains('max-sm:max-h-[calc(100dvh-1rem)]'),
      true
    )
    assert.equal(description.classList.contains('max-sm:overflow-y-auto'), true)
    assert.equal(footer.classList.contains('max-sm:shrink-0'), true)
    assert.equal(footer.querySelectorAll('button').length, 3)

    await act(async () => root.unmount())
    container.remove()
  })
})
