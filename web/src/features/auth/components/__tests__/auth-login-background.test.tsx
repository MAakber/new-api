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
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { AuthLoginBackground } = await import('../auth-login-background')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('AuthLoginBackground', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps the ambient grid decorative and out of the tab order', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<AuthLoginBackground />))

    const background = container.firstElementChild
    assert.ok(background)
    assert.equal(background.getAttribute('aria-hidden'), 'true')
    assert.equal(
      background.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length,
      0
    )

    await act(async () => root.unmount())
    container.remove()
  })
})
