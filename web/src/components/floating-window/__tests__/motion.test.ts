import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { MOTION_VARIANTS } from '../../../lib/motion'

describe('floating window motion', () => {
  test('opens from a subtle offset into its resting state', () => {
    const variants = MOTION_VARIANTS.floatingWindow

    assert.deepEqual(variants.initial, { opacity: 0, scale: 0.96, y: 8 })
    assert.deepEqual(variants.animate, { opacity: 1, scale: 1, y: 0 })
  })

  test('fades and contracts before being removed', () => {
    assert.deepEqual(MOTION_VARIANTS.floatingWindow.exit, {
      opacity: 0,
      scale: 0.96,
      y: 4,
    })
  })
})
