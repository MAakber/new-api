import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
