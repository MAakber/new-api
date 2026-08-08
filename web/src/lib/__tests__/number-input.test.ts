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

import { parseIntegerInputValue, parseNumberInputValue } from '../number-input'

describe('number input parsing', () => {
  test('preserves an empty draft instead of converting it to zero', () => {
    assert.equal(parseNumberInputValue(''), '')
    assert.equal(parseNumberInputValue('  '), '')
  })

  test('parses finite decimal values', () => {
    assert.equal(parseNumberInputValue('1.25'), 1.25)
    assert.equal(parseNumberInputValue('Infinity'), '')
  })

  test('parses integer values without an empty fallback', () => {
    assert.equal(parseIntegerInputValue('12'), 12)
    assert.equal(parseIntegerInputValue('12.5'), 12)
    assert.equal(parseIntegerInputValue(''), '')
  })
})
