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
