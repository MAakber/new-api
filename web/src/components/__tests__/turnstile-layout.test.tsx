import assert from 'node:assert/strict'

import { Window } from 'happy-dom'
import { afterAll as after, describe, test } from 'vitest'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { Turnstile } = await import('../turnstile')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('Turnstile layout', () => {
  after(() => {
    domWindow.close()
  })

  test('centers the Cloudflare verification widget in its container', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<Turnstile siteKey='test-site-key' onVerify={() => {}} />)
    })

    const widgetContainer = container.firstElementChild
    assert.ok(widgetContainer)
    assert.equal(widgetContainer.classList.contains('flex'), true)
    assert.equal(widgetContainer.classList.contains('justify-center'), true)

    await act(async () => root.unmount())
    container.remove()
  })
})
