import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { DEFAULT_THEME_SETTINGS } from '@/lib/theme-customization'

import {
  mergePersistedSystemConfigState,
  type SystemConfigState,
} from '../system-config-store'

function createCurrentState(): SystemConfigState {
  return {
    config: {
      systemName: 'New API',
      logo: '/logo.png',
      defaultTheme: DEFAULT_THEME_SETTINGS,
      currency: {
        displayInCurrency: true,
        quotaDisplayType: 'USD',
        quotaPerUnit: 500000,
        usdExchangeRate: 1,
        customCurrencySymbol: '¤',
        customCurrencyExchangeRate: 1,
      },
    },
    loading: true,
    loadedLogoUrl: '/logo.png',
    setConfig: () => undefined,
    setLoadedLogoUrl: () => undefined,
    setLoading: () => undefined,
  }
}

describe('system config persistence', () => {
  test('restores missing theme defaults when hydrating legacy browser state', () => {
    const state = mergePersistedSystemConfigState(
      {
        config: {
          systemName: 'Existing Site',
          logo: '/existing-logo.png',
          currency: { quotaDisplayType: 'CNY' },
        },
        loadedLogoUrl: '/existing-logo.png',
      },
      createCurrentState()
    )

    assert.deepEqual(state.config.defaultTheme, DEFAULT_THEME_SETTINGS)
    assert.equal(state.config.systemName, 'Existing Site')
    assert.equal(state.config.currency.quotaDisplayType, 'CNY')
    assert.equal(state.config.currency.quotaPerUnit, 500000)
    assert.equal(state.loadedLogoUrl, '/existing-logo.png')
  })

  test('fills newly added fields in a partially persisted default theme', () => {
    const state = mergePersistedSystemConfigState(
      {
        config: {
          defaultTheme: {
            mode: 'dark',
            preset: 'anthropic',
          },
        },
      },
      createCurrentState()
    )

    assert.equal(state.config.defaultTheme.mode, 'dark')
    assert.equal(state.config.defaultTheme.preset, 'anthropic')
    assert.equal(state.config.defaultTheme.sidebarOpen, true)
    assert.equal(state.config.defaultTheme.direction, 'ltr')
  })
})
