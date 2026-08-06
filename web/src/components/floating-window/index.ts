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
export { FloatingWindowHost } from './floating-window-host'
export {
  clampFloatingWindowRect,
  createDefaultFloatingWindowRect,
  DEFAULT_FLOATING_WINDOW_RECT,
  FLOATING_WINDOW_DESKTOP_BREAKPOINT,
  FLOATING_WINDOW_MIN_HEIGHT,
  FLOATING_WINDOW_MIN_WIDTH,
} from './geometry'
export type {
  FloatingWindowCloseCallback,
  FloatingWindowDescriptor,
  FloatingWindowKind,
  FloatingWindowMode,
  FloatingWindowRect,
  FloatingWindowViewport,
  OpenChannelEditorWindowOptions,
  OpenFloatingWindowOptions,
} from './types'
