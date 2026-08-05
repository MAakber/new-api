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
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { LegalConsent } = await import('../legal-consent')
const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'zh',
  resources: {
    zh: {
      translation: {
        'I have read and agree to the': '我已阅读并同意',
        'User Agreement': '用户协议',
        'and the': '和',
        'Privacy Policy': '隐私政策',
      },
    },
  },
})

describe('LegalConsent translations', () => {
  after(() => {
    domWindow.close()
  })

  test('renders both legal links without English connector text in Chinese', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <LegalConsent
            status={{
              user_agreement_enabled: true,
              privacy_policy_enabled: true,
            }}
            checked={false}
            onCheckedChange={() => {}}
          />
        </I18nextProvider>
      )
    })

    const renderedText = container.textContent?.replaceAll(/\s/g, '')
    assert.equal(renderedText, '我已阅读并同意用户协议和隐私政策.')
    assert.equal(renderedText?.includes('andthe'), false)

    await act(async () => root.unmount())
    container.remove()
  })
})
