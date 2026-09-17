import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
