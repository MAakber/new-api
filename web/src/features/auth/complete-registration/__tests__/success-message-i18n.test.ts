import assert from 'node:assert/strict'

import { createInstance } from 'i18next'
import { describe, test } from 'vitest'

import en from '@/i18n/locales/en.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'

const SUCCESS_MESSAGE_KEY = 'Account created successfully'

describe('registration completion success message translations', () => {
  test('shows a Simplified Chinese message after registration succeeds', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'zhCN', resources: { en, zhCN } })

    assert.equal(i18n.t(SUCCESS_MESSAGE_KEY), '账户创建成功')
  })

  test('shows a Traditional Chinese message after registration succeeds', async () => {
    const i18n = createInstance()
    await i18n.init({ lng: 'zhTW', resources: { en, zhTW } })

    assert.equal(i18n.t(SUCCESS_MESSAGE_KEY), '帳戶建立成功')
  })
})
