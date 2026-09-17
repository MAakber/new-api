import assert from 'node:assert/strict'

import type { TFunction } from 'i18next'
import { describe, test } from 'vitest'

import {
  getRedemptionStatusOptions,
  REDEMPTION_STATUSES,
  REDEMPTION_STATUS,
} from '../../constants'

describe('redemption status presentation', () => {
  test('presents used codes as neutral invalid codes', () => {
    const translate = ((key: string) => key) as TFunction
    const options = getRedemptionStatusOptions(translate)
    const usedOption = options.find(
      (option) => option.value === String(REDEMPTION_STATUS.USED)
    )

    assert.equal(usedOption?.label, 'Invalid')
    assert.equal(REDEMPTION_STATUSES[REDEMPTION_STATUS.USED].variant, 'neutral')
  })
})
