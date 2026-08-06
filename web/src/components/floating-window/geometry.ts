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
import type { FloatingWindowRect, FloatingWindowViewport } from './types'

export const FLOATING_WINDOW_DESKTOP_BREAKPOINT = 768
export const FLOATING_WINDOW_MIN_WIDTH = 640
export const FLOATING_WINDOW_MIN_HEIGHT = 480

export const DEFAULT_FLOATING_WINDOW_RECT: FloatingWindowRect = {
  x: 64,
  y: 64,
  width: 1080,
  height: 760,
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function clampSize(
  value: number,
  minimum: number,
  viewportSize: number
): number {
  const effectiveMinimum = Math.min(minimum, viewportSize)
  return clamp(value, effectiveMinimum, viewportSize)
}

/**
 * Keeps a desktop window fully visible while preserving the configured minimum
 * size whenever the viewport has enough room for it.
 */
export function clampFloatingWindowRect(
  rect: FloatingWindowRect,
  viewport: FloatingWindowViewport
): FloatingWindowRect {
  const viewportWidth = Math.max(0, finiteOr(viewport.width, 0))
  const viewportHeight = Math.max(0, finiteOr(viewport.height, 0))
  const width = clampSize(
    finiteOr(rect.width, FLOATING_WINDOW_MIN_WIDTH),
    FLOATING_WINDOW_MIN_WIDTH,
    viewportWidth
  )
  const height = clampSize(
    finiteOr(rect.height, FLOATING_WINDOW_MIN_HEIGHT),
    FLOATING_WINDOW_MIN_HEIGHT,
    viewportHeight
  )

  return {
    x: clamp(finiteOr(rect.x, 0), 0, Math.max(0, viewportWidth - width)),
    y: clamp(finiteOr(rect.y, 0), 0, Math.max(0, viewportHeight - height)),
    width,
    height,
  }
}

export function createDefaultFloatingWindowRect(
  position: number
): FloatingWindowRect {
  const normalizedPosition = Number.isFinite(position)
    ? Math.max(0, Math.floor(position))
    : 0
  const offset = (normalizedPosition % 6) * 28

  return {
    ...DEFAULT_FLOATING_WINDOW_RECT,
    x: DEFAULT_FLOATING_WINDOW_RECT.x + offset,
    y: DEFAULT_FLOATING_WINDOW_RECT.y + offset,
  }
}

export function floatingWindowRectsEqual(
  first: FloatingWindowRect,
  second: FloatingWindowRect
): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  )
}
