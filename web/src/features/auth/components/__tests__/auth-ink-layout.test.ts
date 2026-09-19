import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, test } from 'vitest'

const authStyles = await readFile(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../styles/auth.css'
  ),
  'utf8'
)

describe('sign-in ink route layout', () => {
  test('keeps the shell full-height and the form pane overflow-safe', () => {
    assert.match(
      authStyles,
      /\.auth-ink-shell\s*\{[\s\S]*?min-height: max\(100svh, 100dvh\);/
    )
    assert.match(authStyles, /\.auth-ink-form-pane\s*\{[\s\S]*?min-width: 0;/)
    assert.match(authStyles, /\.auth-ink-form\s*\{[\s\S]*?max-width: 400px;/)
  })

  test('keeps mobile brand pane and authentication links reachable', () => {
    assert.match(
      authStyles,
      /@media \(max-width: 639px\)\s*\{[\s\S]*?\.auth-ink-action-link\s*\{[\s\S]*?min-height: 2\.75rem;/
    )
    assert.match(
      authStyles,
      /@media \(max-width: 639px\)\s*\{[\s\S]*?\.auth-ink-form form a\[href='\/forgot-password'\]\s*\{[\s\S]*?min-height: 2\.75rem;/
    )
  })

  test('keeps the route map non-interactive and static under reduced motion', () => {
    assert.match(authStyles, /\.auth-ink-map\s*\{[\s\S]*?pointer-events: none;/)
    assert.match(
      authStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.auth-ink-map\.is-animated \.ink-route-line,[\s\S]*?animation: none;/
    )
  })
})
