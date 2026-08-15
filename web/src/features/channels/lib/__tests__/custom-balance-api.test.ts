/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { api } from '@/lib/api'

import {
  checkinCustomBalance,
  getCustomBalanceConfig,
  refreshCustomBalance,
  updateCustomBalanceConfig,
} from '../../api'
import type { CustomBalanceUpdatePayload } from '../../types'

const originalGet = api.get
const originalPut = api.put
const originalPost = api.post

after(() => {
  api.get = originalGet
  api.put = originalPut
  api.post = originalPost
})

describe('custom balance API contract', () => {
  test('uses the channel-scoped custom balance endpoints', async () => {
    const calls: Array<{ method: string; url: string; data?: unknown }> = []
    const response = { success: true, data: { enabled: true } }

    api.get = (async (url, config) => {
      calls.push({ method: 'GET', url })
      assert.equal(config?.skipBusinessError, true)
      assert.equal(config?.skipErrorHandler, true)
      return { data: response }
    }) as typeof api.get
    api.put = (async (url, data, config) => {
      calls.push({ method: 'PUT', url, data })
      assert.equal(config?.skipBusinessError, true)
      assert.equal(config?.skipErrorHandler, true)
      return { data: response }
    }) as typeof api.put
    api.post = (async (url, data, config) => {
      calls.push({ method: 'POST', url, data })
      assert.equal(config?.skipBusinessError, true)
      assert.equal(config?.skipErrorHandler, true)
      return { data: response }
    }) as typeof api.post

    const payload: CustomBalanceUpdatePayload = {
      enabled: true,
      provider: 'new_api',
      use_channel_key: true,
      auth_type: 'token',
      user_id: '42',
      quota_per_unit: 1,
      auto_balance: true,
      auto_checkin: true,
      balance_interval_seconds: 3600,
      checkin_interval_seconds: 86400,
      retry_max_attempts: 3,
      retry_interval_seconds: 60,
    }

    await getCustomBalanceConfig(42)
    await updateCustomBalanceConfig(42, payload)
    await refreshCustomBalance(42)
    await checkinCustomBalance(42)

    assert.deepEqual(calls, [
      { method: 'GET', url: '/api/channel/42/custom-balance' },
      {
        method: 'PUT',
        url: '/api/channel/42/custom-balance',
        data: payload,
      },
      {
        method: 'POST',
        url: '/api/channel/42/custom-balance/refresh',
        data: undefined,
      },
      {
        method: 'POST',
        url: '/api/channel/42/custom-balance/checkin',
        data: undefined,
      },
    ])
  })
})
