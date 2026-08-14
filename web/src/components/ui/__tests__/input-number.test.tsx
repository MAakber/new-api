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
  'Node',
  'Element',
  'Event',
  'MouseEvent',
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

const { act, useState } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { Input } = await import('../input')

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
        Add: 'Add',
        Subtract: 'Subtract',
      },
    },
  },
})

function ControlledNumberInput() {
  const [value, setValue] = useState<number | ''>(2)

  return (
    <Input
      type='number'
      min={0}
      max={10}
      step={2}
      value={value}
      onChange={(event) => {
        const next = event.currentTarget.value
        setValue(next === '' ? '' : Number(next))
      }}
    />
  )
}

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    domWindow.HTMLInputElement.prototype,
    'value'
  )?.set
  assert.ok(valueSetter)
  valueSetter.call(input, value)
  input.dispatchEvent(
    new domWindow.Event('input', { bubbles: true }) as unknown as Event
  )
}

describe('number input controls', () => {
  after(() => {
    domWindow.close()
  })

  test('increments, decrements, and preserves an empty draft', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ControlledNumberInput />
        </I18nextProvider>
      )
    })

    const input = container.querySelector<HTMLInputElement>('input')
    const increment = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add"]'
    )
    const decrement = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Subtract"]'
    )
    assert.ok(input)
    assert.ok(increment)
    assert.ok(decrement)
    assert.equal(input.value, '2')

    const spinnerRail = increment.parentElement
    assert.ok(spinnerRail)
    assert.equal(spinnerRail, decrement.parentElement)
    assert.equal(spinnerRail.classList.contains('inset-y-px'), true)
    assert.equal(spinnerRail.classList.contains('right-px'), true)
    assert.equal(spinnerRail.classList.contains('grid'), true)
    assert.equal(spinnerRail.classList.contains('grid-rows-2'), true)
    assert.equal(
      spinnerRail.classList.contains('rounded-r-[calc(var(--radius)-1px)]'),
      true
    )

    await act(async () => increment.click())
    assert.equal(input.value, '4')

    await act(async () => decrement.click())
    assert.equal(input.value, '2')

    await act(async () => {
      increment.click()
      increment.click()
      increment.click()
      increment.click()
    })
    assert.equal(input.value, '10')

    await act(async () => increment.click())
    assert.equal(input.value, '10')

    await act(async () => changeInputValue(input, ''))
    assert.equal(input.value, '')

    await act(async () => changeInputValue(input, '6'))
    assert.equal(input.value, '6')

    await act(async () => root.unmount())
    container.remove()
  })
})
