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
import { describe, test } from 'node:test'

import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'

import { SecuritySection } from '../security-section'

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
  returnNull: false,
})

const ipUsers = [
  {
    user_id: 7,
    username: 'api-user',
    ip_count: 3,
    request_count: 12,
    last_seen: 1_750_000_000,
  },
]

function renderSecuritySection(isAdmin: boolean): string {
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <SecuritySection
        bans={[]}
        ipUsers={ipUsers}
        isAdmin={isAdmin}
        loading={false}
        error={false}
        banSort='count'
        onBanSortChange={() => undefined}
      />
    </I18nextProvider>
  )
}

describe('rankings security visibility', () => {
  test('hides the user IP leaderboard from non-admin viewers', () => {
    const markup = renderSecuritySection(false)

    assert.equal(markup.includes('Hall of bans'), true)
    assert.equal(markup.includes('User IP leaderboard'), false)
    assert.equal(markup.includes('api-user'), false)
  })

  test('shows the user IP leaderboard to administrators', () => {
    const markup = renderSecuritySection(true)

    assert.equal(markup.includes('User IP leaderboard'), true)
    assert.equal(markup.includes('api-user'), true)
  })
})
