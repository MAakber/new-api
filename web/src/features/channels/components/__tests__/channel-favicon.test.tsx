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
  'HTMLImageElement',
  'HTMLAnchorElement',
  'SVGElement',
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

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { ChannelFavicon } = await import('../channel-favicon')

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
        'Open in new tab': 'Open in new tab',
      },
    },
  },
})

describe('ChannelFavicon', () => {
  after(() => {
    domWindow.close()
  })

  test('renders a safe lazy image link to the upstream Base URL', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChannelFavicon baseUrl='https://provider.example/api/v1' />
        </I18nextProvider>
      )
    })

    const link = container.querySelector<HTMLAnchorElement>('a')
    const image = container.querySelector<HTMLImageElement>('img')
    assert.ok(link)
    assert.ok(image)
    assert.equal(link.getAttribute('href'), 'https://provider.example/api/v1')
    assert.equal(link.getAttribute('target'), '_blank')
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer')
    assert.equal(link.getAttribute('aria-label'), 'Open in new tab')
    assert.equal(link.getAttribute('title'), 'Open in new tab')
    assert.equal(
      image.getAttribute('src'),
      'https://provider.example/favicon.ico'
    )
    assert.equal(image.getAttribute('alt'), '')
    assert.equal(image.getAttribute('loading'), 'lazy')
    assert.equal(image.getAttribute('decoding'), 'async')
    assert.equal(image.getAttribute('referrerpolicy'), 'no-referrer')

    await act(async () => root.unmount())
    container.remove()
  })

  test('removes the icon after the favicon request fails', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChannelFavicon baseUrl='https://provider.example' />
        </I18nextProvider>
      )
    })

    const image = container.querySelector<HTMLImageElement>('img')
    assert.ok(image)

    await act(async () => {
      image.dispatchEvent(new domWindow.Event('error') as unknown as Event)
    })

    assert.equal(container.querySelector('a'), null)
    assert.equal(container.querySelector('img'), null)

    await act(async () => root.unmount())
    container.remove()
  })

  test('does not render a link for an unsafe Base URL', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ChannelFavicon baseUrl='javascript:alert(1)' />
        </I18nextProvider>
      )
    })
    assert.equal(container.querySelector('a'), null)
    assert.equal(container.querySelector('img'), null)

    await act(async () => root.unmount())
    container.remove()
  })
})
