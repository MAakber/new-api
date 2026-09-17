import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

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
