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
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const authStyles = await readFile(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../styles/auth.css'
  ),
  'utf8'
)

describe('sign-in responsive layout', () => {
  test('keeps a short mobile viewport scrollable without centering overflow', () => {
    assert.match(
      authStyles,
      /\.auth-login-shell\s*\{[\s\S]*?min-height: max\(100svh, 100dvh\);[\s\S]*?overflow-x: clip;/
    )
    assert.match(
      authStyles,
      /@media \(max-width: 639px\)\s*\{[\s\S]*?\.auth-login-stage\s*\{[\s\S]*?align-items: flex-start;[\s\S]*?padding-top:/
    )
    assert.match(
      authStyles,
      /\.auth-login-content\s*\{[\s\S]*?min-width: 0;[\s\S]*?max-width: 100%;/
    )
  })

  test('keeps mobile brand and authentication links reachable', () => {
    assert.match(
      authStyles,
      /\.auth-login-brand\s*\{[\s\S]*?overflow: hidden;[\s\S]*?\}/
    )
    assert.match(
      authStyles,
      /\.auth-login-action-link\s*\{[\s\S]*?min-height: 2\.75rem;[\s\S]*?\}/
    )
    assert.match(
      authStyles,
      /\.auth-login-content form a\[href='\/forgot-password'\]\s*\{[\s\S]*?min-height: 2\.75rem;[\s\S]*?\}/
    )
  })

  test('preserves reduced-motion and non-interactive background contracts', () => {
    assert.match(
      authStyles,
      /\.auth-login-background\s*\{[\s\S]*?pointer-events: none;/
    )
    assert.match(
      authStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.auth-login-background::before,[\s\S]*?\.auth-login-background::after[\s\S]*?animation: none;/
    )
  })
})
