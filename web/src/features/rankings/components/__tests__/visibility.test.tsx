import assert from 'node:assert/strict'

import { createInstance } from 'i18next'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { describe, test } from 'vitest'

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
