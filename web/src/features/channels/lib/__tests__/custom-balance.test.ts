import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  buildCustomBalancePayload,
  createCustomBalanceFormValues,
  CUSTOM_BALANCE_DEFAULT_VALUES,
  normalizeCustomBalanceSettings,
} from '../custom-balance'

describe('custom balance serialization', () => {
  test('uses safe defaults when the backend returns no configuration', () => {
    assert.deepEqual(createCustomBalanceFormValues(), {
      ...CUSTOM_BALANCE_DEFAULT_VALUES,
    })
    assert.equal(normalizeCustomBalanceSettings().credential_set, false)
  })

  test('switching to the channel key omits an independent credential', () => {
    const payload = buildCustomBalancePayload({
      ...CUSTOM_BALANCE_DEFAULT_VALUES,
      use_channel_key: true,
      credential: 'independent-secret',
    })

    assert.equal(payload.use_channel_key, true)
    assert.equal('credential' in payload, false)
  })

  test('switching to an independent credential preserves an empty value', () => {
    const payload = buildCustomBalancePayload({
      ...CUSTOM_BALANCE_DEFAULT_VALUES,
      use_channel_key: false,
      credential: '',
    })

    assert.equal(payload.use_channel_key, false)
    assert.equal('credential' in payload, false)
  })

  test('serializes a new independent credential only when entered', () => {
    const payload = buildCustomBalancePayload({
      ...CUSTOM_BALANCE_DEFAULT_VALUES,
      use_channel_key: false,
      auth_type: 'cookie',
      credential: '  browser-cookie  ',
    })

    assert.equal(payload.auth_type, 'cookie')
    assert.equal(payload.credential, 'browser-cookie')
  })

  test('never echoes a credential from a response into editable values', () => {
    const values = createCustomBalanceFormValues({
      credential_set: true,
      use_channel_key: false,
      auth_type: 'cookie',
      credential: 'server-secret',
    } as unknown as Parameters<typeof createCustomBalanceFormValues>[0])

    assert.equal(values.credential, '')
    assert.equal(values.use_channel_key, false)
    assert.equal(values.auth_type, 'cookie')
  })

  test('preserves a supported compatible provider from the response', () => {
    const values = createCustomBalanceFormValues({ provider: 'veloera' })

    assert.equal(values.provider, 'veloera')
    assert.equal(buildCustomBalancePayload(values).provider, 'veloera')
  })

  test('serializes the balance-limit auto-ban ignore switch', () => {
    const payload = buildCustomBalancePayload({
      ...CUSTOM_BALANCE_DEFAULT_VALUES,
      ignore_balance_auto_ban: true,
    })

    assert.equal(payload.ignore_balance_auto_ban, true)
    assert.equal(
      createCustomBalanceFormValues({ ignore_balance_auto_ban: true })
        .ignore_balance_auto_ban,
      true
    )
  })
})
