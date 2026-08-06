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
