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
  'HTMLInputElement',
  'HTMLTextAreaElement',
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
const { ParamOverrideEditorDialog } =
  await import('../param-override-editor-dialog')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

describe('parameter override editor dialog layout', () => {
  after(() => {
    domWindow.close()
  })

  test('stacks the rules panel on narrow screens and caps JSON editor height', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ParamOverrideEditorDialog
            open
            value='{"operations":[{"mode":"set","path":"temperature","value":0.7}]}'
            onOpenChange={() => undefined}
            onSave={() => undefined}
          />
        </I18nextProvider>
      )
    })

    const content = document.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]'
    )
    assert.ok(content)

    const rulesLabel = [...content.querySelectorAll('span')].find(
      (element) => element.textContent === 'Rules'
    )
    assert.ok(rulesLabel)
    const sidebar = rulesLabel.closest('div')?.parentElement?.parentElement
    assert.ok(sidebar)
    const editorLayout = sidebar.parentElement
    assert.ok(editorLayout)

    assert.equal(editorLayout.classList.contains('flex-col'), true)
    assert.equal(editorLayout.classList.contains('md:flex-row'), true)
    assert.equal(sidebar.classList.contains('w-full'), true)
    assert.equal(sidebar.classList.contains('border-b'), true)
    assert.equal(sidebar.classList.contains('md:w-[280px]'), true)

    const jsonButton = [...content.querySelectorAll('button')].find(
      (button) => button.textContent === 'JSON Text'
    )
    assert.ok(jsonButton)

    await act(async () => jsonButton.click())

    const editorMount = content.querySelector('.json-code-editor-yace')
    assert.ok(editorMount)
    const editorHeight = editorMount.parentElement
    assert.ok(editorHeight)
    assert.equal(editorHeight.classList.contains('h-[min(50dvh,420px)]'), true)
    assert.equal(editorHeight.classList.contains('min-h-[12rem]'), true)
    assert.equal(editorHeight.classList.contains('md:h-[420px]'), true)
    assert.equal(editorHeight.classList.contains('min-h-[420px]'), false)

    await act(async () => root.unmount())
    container.remove()
  })
})
