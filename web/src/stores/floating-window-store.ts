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
import { create } from 'zustand'

import {
  clampFloatingWindowRect,
  createDefaultFloatingWindowRect,
  FLOATING_WINDOW_DESKTOP_BREAKPOINT,
  floatingWindowRectsEqual,
} from '@/components/floating-window/geometry'
import type {
  FloatingWindowDescriptor,
  FloatingWindowRect,
  FloatingWindowViewport,
  OpenChannelEditorWindowOptions,
  OpenFloatingWindowOptions,
} from '@/components/floating-window/types'

export type FloatingWindowStore = {
  windows: FloatingWindowDescriptor[]
  activeWindowId: string | null
  openWindow: (options: OpenFloatingWindowOptions) => string
  openChannelEditor: (options: OpenChannelEditorWindowOptions) => string
  closeWindow: (instanceId: string) => void
  clearWindows: () => void
  activateWindow: (instanceId: string) => void
  updateWindowRect: (instanceId: string, rect: FloatingWindowRect) => void
  clampWindowsToViewport: (viewport: FloatingWindowViewport) => void
}

let fallbackInstanceSequence = 0

function createInstanceId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }

  fallbackInstanceSequence += 1
  return `floating-window-${Date.now()}-${fallbackInstanceSequence}`
}

function getHighestOrder(windows: FloatingWindowDescriptor[]): number {
  return windows.reduce(
    (highestOrder, descriptor) => Math.max(highestOrder, descriptor.order),
    0
  )
}

function getTopWindowId(windows: FloatingWindowDescriptor[]): string | null {
  let topWindow: FloatingWindowDescriptor | undefined

  for (const descriptor of windows) {
    if (!topWindow || descriptor.order > topWindow.order) {
      topWindow = descriptor
    }
  }

  return topWindow?.instanceId ?? null
}

function getChannelId(options: OpenFloatingWindowOptions): number | null {
  if (options.mode === 'create') return null

  if (
    typeof options.channelId !== 'number' ||
    !Number.isFinite(options.channelId)
  ) {
    throw new Error('An edit channel window requires a numeric channelId.')
  }

  return options.channelId
}

function getWindowIdentity(
  options: Pick<FloatingWindowDescriptor, 'kind' | 'mode' | 'channelId'>
): string | null {
  if (options.kind === 'channel-editor' && options.mode === 'edit') {
    return `channel-editor:edit:${options.channelId}`
  }

  return null
}

function getCurrentDesktopViewport(): FloatingWindowViewport | null {
  if (
    typeof window === 'undefined' ||
    window.innerWidth < FLOATING_WINDOW_DESKTOP_BREAKPOINT
  ) {
    return null
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  }
}

function clampForCurrentDesktopViewport(
  rect: FloatingWindowRect
): FloatingWindowRect {
  const viewport = getCurrentDesktopViewport()
  return viewport ? clampFloatingWindowRect(rect, viewport) : { ...rect }
}

function getDefaultTitle(options: OpenFloatingWindowOptions): string {
  return options.mode === 'edit' ? 'Edit Channel' : 'Create Channel'
}

function createDescriptor(
  options: OpenFloatingWindowOptions,
  channelId: number | null,
  position: number,
  order: number
): FloatingWindowDescriptor {
  const rect = clampForCurrentDesktopViewport(
    options.rect ?? createDefaultFloatingWindowRect(position)
  )
  const identity = getWindowIdentity({
    kind: options.kind,
    mode: options.mode,
    channelId,
  })

  return {
    kind: options.kind,
    mode: options.mode,
    channelId,
    title: options.title ?? getDefaultTitle(options),
    instanceId: createInstanceId(),
    identity,
    rect,
    order,
    onClose: options.onClose,
  }
}

/** Returns the stable singleton key for an existing descriptor, if it has one. */
export function getFloatingWindowIdentity(
  descriptor: FloatingWindowDescriptor
): string | null {
  return descriptor.identity
}

/**
 * Ephemeral UI state only. This store deliberately has no persistence
 * middleware so floating windows are scoped to the current application run.
 */
export const useFloatingWindowStore = create<FloatingWindowStore>()(
  (set, get) => ({
    windows: [],
    activeWindowId: null,

    openWindow: (options) => {
      const channelId = getChannelId(options)
      const identity = getWindowIdentity({
        kind: options.kind,
        mode: options.mode,
        channelId,
      })
      const existingWindow = identity
        ? get().windows.find((descriptor) => descriptor.identity === identity)
        : undefined

      if (existingWindow) {
        get().activateWindow(existingWindow.instanceId)
        return existingWindow.instanceId
      }

      const currentWindows = get().windows
      const descriptor = createDescriptor(
        options,
        channelId,
        currentWindows.length,
        getHighestOrder(currentWindows) + 1
      )

      set((state) => ({
        windows: [...state.windows, descriptor],
        activeWindowId: descriptor.instanceId,
      }))

      return descriptor.instanceId
    },

    openChannelEditor: (options) => {
      return get().openWindow({
        ...options,
        kind: 'channel-editor',
      })
    },

    closeWindow: (instanceId) => {
      const windowToClose = get().windows.find(
        (descriptor) => descriptor.instanceId === instanceId
      )
      if (!windowToClose) return

      set((state) => {
        const windows = state.windows.filter(
          (descriptor) => descriptor.instanceId !== instanceId
        )

        return {
          windows,
          activeWindowId:
            state.activeWindowId === instanceId
              ? getTopWindowId(windows)
              : state.activeWindowId,
        }
      })

      windowToClose.onClose?.(windowToClose)
    },

    clearWindows: () => {
      set({ windows: [], activeWindowId: null })
    },

    activateWindow: (instanceId) => {
      set((state) => {
        const targetWindow = state.windows.find(
          (descriptor) => descriptor.instanceId === instanceId
        )
        if (!targetWindow) return state

        const highestOrder = getHighestOrder(state.windows)
        const order =
          targetWindow.order === highestOrder ? highestOrder : highestOrder + 1

        return {
          windows: state.windows.map((descriptor) => {
            if (descriptor.instanceId !== instanceId) return descriptor

            return { ...descriptor, order }
          }),
          activeWindowId: instanceId,
        }
      })
    },

    updateWindowRect: (instanceId, rect) => {
      const nextRect = clampForCurrentDesktopViewport(rect)

      set((state) => {
        const targetWindow = state.windows.find(
          (descriptor) => descriptor.instanceId === instanceId
        )
        if (
          !targetWindow ||
          floatingWindowRectsEqual(targetWindow.rect, nextRect)
        ) {
          return state
        }

        return {
          windows: state.windows.map((descriptor) => {
            if (descriptor.instanceId !== instanceId) return descriptor

            return { ...descriptor, rect: nextRect }
          }),
        }
      })
    },

    clampWindowsToViewport: (viewport) => {
      set((state) => {
        let didChange = false
        const windows = state.windows.map((descriptor) => {
          const rect = clampFloatingWindowRect(descriptor.rect, viewport)
          if (floatingWindowRectsEqual(descriptor.rect, rect)) {
            return descriptor
          }

          didChange = true
          return { ...descriptor, rect }
        })

        return didChange ? { windows } : state
      })
    },
  })
)
