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

  test('drops the decorative stage pane on the single-column layout', () => {
    // Hidden by default so phones never render a second screen under the
    // form; only the two-column layout below brings it back.
    assert.match(authStyles, /\.auth-ink-stage-pane\s*\{\s*display: none;/)
    assert.match(
      authStyles,
      /@media \(min-width: 1024px\)\s*\{[\s\S]*?\.auth-ink-stage-pane\s*\{[\s\S]*?display: flex;/
    )
  })

  test('keeps the reel non-interactive and static under reduced motion', () => {
    assert.match(
      authStyles,
      /\.auth-ink-reel\s*\{[\s\S]*?pointer-events: none;/
    )
    assert.match(
      authStyles,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ink-reel-trace,[\s\S]*?animation: none;/
    )
  })

  test('plays the three beats in order: outline, highlight, logo', () => {
    // The rhythm spec, in one place: the outline is drawn 80-880ms, the
    // highlight runs over it 880-1360ms, the logo completes fill at 960-1320ms as
    // highlight sweeps across, and the outline dissolves into it.
    assert.match(authStyles, /--reel-trace-delay: 80ms;/)
    assert.match(authStyles, /--reel-trace-duration: 800ms;/)
    assert.match(authStyles, /--reel-sheen-delay: 880ms;/)
    assert.match(authStyles, /--reel-sheen-duration: 480ms;/)
    assert.match(authStyles, /--reel-fill-delay: 960ms;/)
    assert.match(authStyles, /--reel-fill-duration: 360ms;/)
    assert.match(authStyles, /--reel-dissolve-delay: 1120ms;/)
  })

  test('walks the outline and the highlight along the path, without a mask', () => {
    // Beat 1 is a full-length dash walking the piece from its own start point,
    // beat 2 a short dash travelling the same route.
    assert.match(
      authStyles,
      /\.ink-reel-trace svg \*\s*\{\s*stroke-dashoffset: 0;/
    )
    assert.match(
      authStyles,
      /@keyframes ink-reel-draw\s*\{[\s\S]*?stroke-dashoffset: var\(--ink-contour-length, 0\);[\s\S]*?stroke-dashoffset: 0;/
    )
    assert.match(
      authStyles,
      /@keyframes ink-reel-sheen\s*\{[\s\S]*?var\(--ink-sheen-span, 0\)[\s\S]*?stroke-dashoffset: var\(--ink-contour-length, 0\);/
    )
    assert.match(
      authStyles,
      /\.ink-reel-sheen svg \*\s*\{[\s\S]*?stroke-dashoffset: var\(--ink-contour-length, 0\);/
    )
    assert.match(
      authStyles,
      /\.ink-reel-sheen svg,[\s\S]*?stroke: var\(--ink-sheen\);/
    )
    assert.match(
      authStyles,
      /\.ink-reel-trace svg,[\s\S]*?fill: none;[\s\S]*?stroke: var\(--ink-coral\);/
    )
    // Each contour piece draws at its own pace, one after another, so a
    // multi-subpath icon closes on the same beat as a single-stroke one.
    assert.match(
      authStyles,
      /var\(--ink-contour-duration, var\(--reel-trace-duration\)\)/
    )
    assert.match(
      authStyles,
      /var\(--ink-contour-duration, var\(--reel-sheen-duration\)\)/
    )
    assert.match(
      authStyles,
      /var\(--ink-contour-index, 0\)\s*\*\s*var\(--ink-contour-step, 0ms\)/
    )
    // The reveal must follow the contours; a mask edge would be a wipe again.
    assert.doesNotMatch(
      authStyles,
      /-webkit-mask|mask-image|mask-position|mask-size/
    )
  })

  test('rests every brand on the finished mark, not on an empty box', () => {
    // Taking an animation away must leave a complete icon behind: the outline
    // layer rests hidden, the fill layer rests opaque.
    assert.match(authStyles, /\.ink-reel-trace\s*\{\s*opacity: 0;\s*\}/)
    assert.match(
      authStyles,
      /@keyframes ink-reel-fill\s*\{[\s\S]*?opacity: 0;[\s\S]*?transform: scale\(0\.92\);[\s\S]*?opacity: 1;/
    )
  })
})
