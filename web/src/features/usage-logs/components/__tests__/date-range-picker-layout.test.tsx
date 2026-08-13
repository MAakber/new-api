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
const { CompactDateTimeRangePicker } =
  await import('../compact-date-time-range-picker')

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
        'Date Range': 'Date Range',
        'Start Time': 'Start Time',
        'End Time': 'End Time',
        Today: 'Today',
        '7 Days': '7 Days',
        'This week': 'This week',
        '30 Days': '30 Days',
        'This month': 'This month',
        Confirm: 'Confirm',
      },
    },
  },
})

describe('usage log date range picker layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the trigger and compact popover usable at narrow widths', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <CompactDateTimeRangePicker
            start={new Date('2026-08-14T00:00:00')}
            end={new Date('2026-08-14T13:30:00')}
            onChange={() => {}}
          />
        </I18nextProvider>
      )
    })

    const trigger = container.querySelector('button')
    assert.ok(trigger)
    assert.equal(trigger.classList.contains('min-w-0'), true)
    assert.equal(trigger.classList.contains('overflow-hidden'), true)

    await act(async () => trigger.click())

    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    assert.ok(popover)
    assert.equal(popover.classList.contains('max-w-[calc(100vw-1rem)]'), true)
    assert.equal(
      popover.classList.contains(
        'max-h-[min(var(--available-height),calc(100dvh-1rem))]'
      ),
      true
    )
    assert.equal(popover.classList.contains('overflow-x-hidden'), true)
    assert.equal(popover.classList.contains('overflow-y-auto'), true)

    const inputs = popover.querySelectorAll('input[type="datetime-local"]')
    assert.equal(inputs.length, 2)
    assert.equal(inputs[0]?.classList.contains('min-w-0'), true)
    assert.equal(inputs[1]?.classList.contains('min-w-0'), true)

    const presetButtons = [...popover.querySelectorAll('button')].filter(
      (button) => button.textContent !== 'Confirm'
    )
    assert.equal(presetButtons.length, 5)
    assert.equal(
      presetButtons.every((button) => button.classList.contains('min-w-0')),
      true
    )

    await act(async () => root.unmount())
    container.remove()
  })
})
