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

import type { BannerFormValues } from '../../types'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'HTMLInputElement',
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
const { useForm } = await import('react-hook-form')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { BannerForm } = await import('../banner-form')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {},
    },
  },
})

function TestBannerForm() {
  const form = useForm<BannerFormValues>({
    defaultValues: {
      content: 'Scheduled maintenance',
      publishDate: '2026-08-10T09:30:00.000Z',
      type: 'default',
      extra: '',
      enabled: true,
      sortOrder: 0,
      startDate: '',
      endDate: '',
      link: '',
    },
  })

  return (
    <I18nextProvider i18n={i18n}>
      <BannerForm form={form} formId='banner-form' onSubmit={() => {}} />
    </I18nextProvider>
  )
}

describe('banner form field layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps publish date controls from shrinking into each other', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<TestBannerForm />))

    const publishLabel = [
      ...container.querySelectorAll('[data-slot="form-label"]'),
    ].find((label) => label.textContent === 'Publish Date')
    assert.ok(publishLabel)

    const publishField = publishLabel.closest('[data-slot="form-item"]')
    assert.ok(publishField)
    assert.equal(publishField.classList.contains('min-w-0'), true)

    const picker = publishField.querySelector<HTMLElement>(
      '[data-slot="date-time-picker"]'
    )
    assert.ok(picker)
    assert.equal(picker.classList.contains('w-full'), true)
    assert.equal(picker.classList.contains('min-w-0'), true)
    assert.equal(picker.classList.contains('flex-wrap'), true)

    const dateButton = picker.querySelector('button:not([aria-label="Clear"])')
    assert.ok(dateButton)
    assert.equal(dateButton.classList.contains('min-w-40'), true)

    const timeInput = picker.querySelector('input[type="time"]')
    assert.ok(timeInput)
    assert.equal(timeInput.classList.contains('shrink-0'), true)

    const clearButton = picker.querySelector('button[aria-label="Clear"]')
    assert.ok(clearButton)
    assert.equal(clearButton.closest('[data-slot="date-time-picker"]'), picker)

    await act(async () => root.unmount())
    container.remove()
  })

  test('keeps sort order spinner controls inside the number field', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<TestBannerForm />))

    const sortLabel = [
      ...container.querySelectorAll('[data-slot="form-label"]'),
    ].find((label) => label.textContent === 'Sort Order')
    assert.ok(sortLabel)

    const sortField = sortLabel.closest('[data-slot="form-item"]')
    assert.ok(sortField)

    const numberInput = sortField.querySelector<HTMLElement>(
      '[data-slot="number-input"]'
    )
    assert.ok(numberInput)

    const increment = numberInput.querySelector<HTMLButtonElement>(
      'button[aria-label="Add"]'
    )
    const decrement = numberInput.querySelector<HTMLButtonElement>(
      'button[aria-label="Subtract"]'
    )
    assert.ok(increment)
    assert.ok(decrement)

    const spinnerRail = increment.parentElement
    assert.ok(spinnerRail)
    assert.equal(spinnerRail, decrement.parentElement)
    assert.equal(spinnerRail.parentElement, numberInput)
    assert.equal(spinnerRail.classList.contains('absolute'), false)
    assert.equal(spinnerRail.classList.contains('grid-rows-2'), true)
    assert.equal(spinnerRail.classList.contains('h-full'), true)

    await act(async () => root.unmount())
    container.remove()
  })
})
