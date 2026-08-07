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

import type { Channel } from '../../../types'
import { resolveFetchModelsChannel } from '../fetch-models-channel'

function channel(id: number): Channel {
  return { id, name: `channel-${id}`, models: '' } as Channel
}

describe('FetchModelsDialog channel selection', () => {
  test('uses the floating editor channel before the provider currentRow', () => {
    const providerCurrentRow = channel(900)
    const floatingEditorChannel = channel(101)

    const activeChannel = resolveFetchModelsChannel(
      floatingEditorChannel,
      providerCurrentRow
    )

    assert.equal(activeChannel?.id, 101)
  })

  test('keeps channel ids isolated when two windows share a provider fallback', () => {
    const providerCurrentRow = channel(900)
    const firstWindowChannel = channel(101)
    const secondWindowChannel = channel(202)

    const firstWindowActiveChannel = resolveFetchModelsChannel(
      firstWindowChannel,
      providerCurrentRow
    )
    const secondWindowActiveChannel = resolveFetchModelsChannel(
      secondWindowChannel,
      providerCurrentRow
    )

    assert.deepEqual(
      [firstWindowActiveChannel?.id, secondWindowActiveChannel?.id],
      [101, 202]
    )
  })
})
