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

import type { TFunction } from 'i18next'

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
