import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { ROLE } from '@/lib/roles'

import { resolveLogsViewAccess } from '../components/usage-logs-provider'

describe('usage log access tier', () => {
  test('keeps users and elevated self views on the self tier', () => {
    assert.equal(resolveLogsViewAccess(ROLE.USER, 'all'), 'self')
    assert.equal(resolveLogsViewAccess(ROLE.ADMIN, 'self'), 'self')
    assert.equal(resolveLogsViewAccess(ROLE.SUPER_ADMIN, 'self'), 'self')
  })

  test('distinguishes admin and root while viewing all logs', () => {
    assert.equal(resolveLogsViewAccess(ROLE.ADMIN, 'all'), 'admin')
    assert.equal(resolveLogsViewAccess(ROLE.SUPER_ADMIN, 'all'), 'root')
  })
})
