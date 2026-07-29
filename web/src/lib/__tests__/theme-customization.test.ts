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

import {
  CUSTOM_THEME_VARIABLE_NAMES,
  getContrastingForeground,
  getCustomThemeVariables,
  normalizeCustomColor,
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
