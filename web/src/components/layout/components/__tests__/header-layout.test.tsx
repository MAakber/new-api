import assert from 'node:assert/strict'

import { Window } from 'happy-dom'
import { afterAll as after, describe, test } from 'vitest'

const domWindow = new Window()
Object.defineProperty(domWindow, 'innerWidth', {
  configurable: true,
  value: 390,
})

for (const key of [
  'window',
  'document',
  'navigator',
  'matchMedia',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { Header } = await import('../header')
const { SidebarProvider, useSidebar } = await import('@/components/ui/sidebar')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

function SidebarStateProbe() {
  const { openMobile } = useSidebar()
  return <output data-open-mobile={String(openMobile)} />
}

describe('authenticated header mobile layout', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the mobile sidebar trigger in its own accessible layout slot', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <SidebarProvider>
            <Header>
              <div data-header-content />
            </Header>
            <SidebarStateProbe />
          </SidebarProvider>
        )
      })

      const trigger = container.querySelector<HTMLButtonElement>(
        '[data-sidebar="trigger"]'
      )
      const triggerSlot = trigger?.parentElement
      const headerContent = container.querySelector('[data-header-content]')
      const headerContentRegion = headerContent?.parentElement

      assert.ok(trigger)
      assert.ok(triggerSlot)
      assert.ok(headerContentRegion)
      assert.equal(
        triggerSlot.getAttribute('data-slot'),
        'sidebar-trigger-slot'
      )
      assert.equal(triggerSlot.classList.contains('shrink-0'), true)
      assert.equal(triggerSlot.classList.contains('size-8'), true)
      assert.equal(headerContentRegion.classList.contains('min-w-0'), true)
      assert.equal(headerContentRegion.classList.contains('flex-1'), true)
      assert.equal(trigger.textContent?.includes('Toggle Sidebar'), true)

      await act(async () => {
        trigger.focus()
      })
      assert.equal(document.activeElement, trigger)

      await act(async () => {
        trigger.click()
      })
      assert.equal(
        container
          .querySelector('[data-open-mobile]')
          ?.getAttribute('data-open-mobile'),
        'true'
      )
    } finally {
      await act(async () => root.unmount())
      container.remove()
    }
  })
})
