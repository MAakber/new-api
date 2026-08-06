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

import { clampFloatingWindowRect } from '../geometry'

describe('floating window geometry', () => {
  test('enforces desktop minimum dimensions and keeps the rect inside the viewport', () => {
    const rect = clampFloatingWindowRect(
      { x: 900, y: 700, width: 100, height: 100 },
      { width: 800, height: 600 }
    )

    assert.deepEqual(rect, {
      x: 160,
      y: 120,
      width: 640,
      height: 480,
    })
  })

  test('uses the available viewport when it is smaller than the desktop minimum', () => {
    const rect = clampFloatingWindowRect(
      { x: 40, y: 40, width: 1000, height: 1000 },
      { width: 300, height: 200 }
    )

    assert.deepEqual(rect, {
      x: 0,
      y: 0,
      width: 300,
      height: 200,
    })
  })
})
