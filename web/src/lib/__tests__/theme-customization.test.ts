import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import {
  CUSTOM_THEME_VARIABLE_NAMES,
  DEFAULT_THEME_SETTINGS,
  getContrastingForeground,
  getCustomThemeVariables,
  normalizeDefaultThemeSettings,
  normalizeCustomColor,
  serializeDefaultThemeSettings,
} from '../theme-customization'

describe('custom theme colors', () => {
  test('normalizes native color values and rejects values that cannot be safely inlined', () => {
    assert.equal(normalizeCustomColor(' #AbC '), '#aabbcc')
    assert.equal(normalizeCustomColor('#6B7280'), '#6b7280')
    assert.equal(normalizeCustomColor('rgb(0, 0, 0)'), null)
    assert.equal(normalizeCustomColor(undefined), null)
  })

  test('chooses a readable foreground for light and dark custom colors', () => {
    assert.equal(getContrastingForeground('#fde047'), '#000000')
    assert.equal(getContrastingForeground('#172554'), '#ffffff')
  })

  test('applies the selected color to all primary, sidebar, ring, and chart tokens', () => {
    const variables = getCustomThemeVariables('#22c55e')

    for (const name of CUSTOM_THEME_VARIABLE_NAMES) {
      assert.ok(variables[name], `${name} should be provided`)
    }

    assert.equal(variables['--primary'], '#22c55e')
    assert.equal(variables['--primary-foreground'], '#000000')
    assert.equal(variables['--sidebar-primary'], '#22c55e')
    assert.equal(variables['--ring'], '#22c55e')
  })
})

describe('default theme settings', () => {
  test('maps the public API payload to the frontend theme defaults', () => {
    const theme = normalizeDefaultThemeSettings({
      mode: 'dark',
      preset: 'custom',
      custom_color: '#ABCDEF',
      font: 'serif',
      radius: 'lg',
      scale: 'sm',
      content_layout: 'centered',
      sidebar_variant: 'floating',
      sidebar_collapsible: 'offcanvas',
      sidebar_open: false,
      direction: 'rtl',
    })

    assert.deepEqual(theme, {
      mode: 'dark',
      preset: 'custom',
      customColor: '#abcdef',
      font: 'serif',
      radius: 'lg',
      scale: 'sm',
      contentLayout: 'centered',
      sidebarVariant: 'floating',
      sidebarCollapsible: 'offcanvas',
      sidebarOpen: false,
      direction: 'rtl',
    })
  })

  test('falls back field by field when the public default is invalid', () => {
    const theme = normalizeDefaultThemeSettings({
      mode: 'sepia',
      preset: 'unknown',
      sidebar_open: 'false',
    })

    assert.deepEqual(theme, DEFAULT_THEME_SETTINGS)
  })

  test('serializes the active theme for the root option API', () => {
    assert.deepEqual(serializeDefaultThemeSettings(DEFAULT_THEME_SETTINGS), {
      mode: 'system',
      preset: 'default',
      custom_color: '#6366f1',
      font: 'default',
      radius: 'default',
      scale: 'default',
      content_layout: 'full',
      sidebar_variant: 'inset',
      sidebar_collapsible: 'icon',
      sidebar_open: true,
      direction: 'ltr',
    })
  })
})
