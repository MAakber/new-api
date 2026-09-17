import assert from 'node:assert/strict'

import { Window } from 'happy-dom'
import { afterAll as after, describe, test } from 'vitest'

const domWindow = new Window({ url: 'https://example.test/' })
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
const { ThemeCustomizationProvider } =
  await import('../theme-customization-provider')
const { DEFAULT_THEME_SETTINGS } = await import('@/lib/theme-customization')
const { useSystemConfigStore } = await import('@/stores/system-config-store')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

describe('ThemeCustomizationProvider DOM attributes', () => {
  after(() => {
    domWindow.close()
  })

  test('keeps non-baseline global defaults applied after they are saved', async () => {
    document.cookie = 'theme_preset=; max-age=0; path=/'
    document.cookie = 'theme_radius=; max-age=0; path=/'
    document.cookie = 'theme_scale=; max-age=0; path=/'
    useSystemConfigStore.getState().setConfig({
      defaultTheme: {
        ...DEFAULT_THEME_SETTINGS,
        preset: 'anthropic',
        radius: 'lg',
        scale: 'sm',
      },
    })
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <ThemeCustomizationProvider>
          <div />
        </ThemeCustomizationProvider>
      )
    })

    assert.equal(document.body.dataset.themePreset, 'anthropic')
    assert.equal(document.body.dataset.themeRadius, 'lg')
    assert.equal(document.body.dataset.themeScale, 'sm')

    await act(async () => root.unmount())
    container.remove()
  })
})
