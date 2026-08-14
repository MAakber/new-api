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

  test('keeps the trigger and custom calendar controls usable at narrow widths', async () => {
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

    assert.equal(
      popover.querySelectorAll('input[type="datetime-local"]').length,
      0
    )

    const timeInputs = popover.querySelectorAll('input[type="time"]')
    assert.equal(timeInputs.length, 2)
    assert.equal(timeInputs[0]?.classList.contains('shrink-0'), true)
    assert.equal(timeInputs[1]?.classList.contains('shrink-0'), true)

    const dateButtons = [...popover.querySelectorAll('button')].filter(
      (button) => button.textContent?.includes('2026-08-14')
    )
    assert.equal(dateButtons.length, 2)
    assert.equal(
      dateButtons.every((button) => button.classList.contains('min-w-0')),
      true
    )

    await act(async () => dateButtons[0]?.click())

    const calendar = document.querySelector('[data-slot="calendar"]')
    assert.ok(calendar)

    const presetLabels = new Set([
      'Today',
      '7 Days',
      'This week',
      '30 Days',
      'This month',
    ])
    const presetButtons = [...popover.querySelectorAll('button')].filter(
      (button) => presetLabels.has(button.textContent ?? '')
    )
    assert.equal(presetButtons.length, 5)
    assert.equal(
      presetButtons.every((button) => button.classList.contains('min-w-0')),
      true
    )

    await act(async () => root.unmount())
    container.remove()
  })

  test('applies a changed time only after confirming the draft range', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const changes: Array<{ start?: Date; end?: Date }> = []
    const start = new Date('2026-08-14T00:00:00')
    const end = new Date('2026-08-14T13:30:00')

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <CompactDateTimeRangePicker
            start={start}
            end={end}
            onChange={(range) => changes.push(range)}
          />
        </I18nextProvider>
      )
    })

    await act(async () => container.querySelector('button')?.click())

    const popover = document.querySelector<HTMLElement>(
      '[data-slot="popover-content"]'
    )
    assert.ok(popover)
    const timeInput =
      popover.querySelector<HTMLInputElement>('input[type="time"]')
    assert.ok(timeInput)

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        domWindow.HTMLInputElement.prototype,
        'value'
      )?.set
      assert.ok(valueSetter)
      valueSetter.call(timeInput, '09:15')
      timeInput.dispatchEvent(
        new domWindow.Event('input', { bubbles: true }) as unknown as Event
      )
    })

    assert.equal(changes.length, 0)

    const confirmButton = [...popover.querySelectorAll('button')].find(
      (button) => button.textContent === 'Confirm'
    )
    assert.ok(confirmButton)
    await act(async () => confirmButton.click())

    assert.equal(changes.length, 1)
    const appliedRange = changes[0]
    assert.ok(appliedRange)
    assert.equal(appliedRange.start?.getHours(), 9)
    assert.equal(appliedRange.start?.getMinutes(), 15)
    assert.equal(appliedRange.end?.getTime(), end.getTime())

    await act(async () => root.unmount())
    container.remove()
  })
})
