/*
 * Copyright (C) 2023-2026 QuantumNous
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * For commercial licensing, please contact support@quantumnous.com
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { getUserRowEditDestination } from '../user-row-action-policy'

test('routes a current user edit to the self-service profile', () => {
  assert.equal(getUserRowEditDestination(42, 42, 10, 100), 'profile')
})

test('keeps another user edit in the management workflow', () => {
  assert.equal(getUserRowEditDestination(42, 7, 10, 100), 'manage')
})

test('keeps root self edits in the management workflow', () => {
  assert.equal(getUserRowEditDestination(42, 42, 100, 100), 'manage')
})
