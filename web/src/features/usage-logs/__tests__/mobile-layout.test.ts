import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { TASK_MOBILE_SUMMARY_FIELDS } from '../lib/task-mobile-layout'

describe('task log mobile layout', () => {
  test('keeps plugin, channel, duration, progress, and artifacts visible in the summary', () => {
    assert.deepEqual(
      TASK_MOBILE_SUMMARY_FIELDS.map((field) => field.id),
      [
        'submit_time',
        'user',
        'plugin',
        'channel_id',
        'duration',
        'progress',
        'artifacts',
      ]
    )
  })
})
