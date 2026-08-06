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
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { useFloatingWindowStore } from '@/stores/floating-window-store'

import { FloatingWindowFrame } from './floating-window-frame'
import { FLOATING_WINDOW_DESKTOP_BREAKPOINT } from './geometry'
import type { FloatingWindowViewport } from './types'

function useViewport(): FloatingWindowViewport | null {
  const [viewport, setViewport] = useState<FloatingWindowViewport | null>(null)

  useEffect(() => {
    const updateViewport = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }

    updateViewport()
    window.addEventListener('resize', updateViewport)

    return () => {
      window.removeEventListener('resize', updateViewport)
    }
  }, [])

  return viewport
}

export function FloatingWindowHost() {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)
  const viewport = useViewport()
  const windows = useFloatingWindowStore((state) => state.windows)
  const activateWindow = useFloatingWindowStore((state) => state.activateWindow)
  const closeWindow = useFloatingWindowStore((state) => state.closeWindow)
  const updateWindowRect = useFloatingWindowStore(
    (state) => state.updateWindowRect
  )
  const clampWindowsToViewport = useFloatingWindowStore(
    (state) => state.clampWindowsToViewport
  )
  const isDesktop =
    viewport !== null && viewport.width >= FLOATING_WINDOW_DESKTOP_BREAKPOINT
  const orderedWindows = useMemo(
    () => [...windows].sort((first, second) => first.order - second.order),
    [windows]
  )

  useEffect(() => {
    setPortalTarget(document.body)

    return () => {
      useFloatingWindowStore.getState().clearWindows()
    }
  }, [])

  useEffect(() => {
    if (!isDesktop || !viewport) return

    clampWindowsToViewport(viewport)
  }, [clampWindowsToViewport, isDesktop, viewport])

  if (!portalTarget) return null

  return createPortal(
    <div className='pointer-events-none fixed inset-0 z-[45]'>
      {orderedWindows.map((descriptor) => (
        <FloatingWindowFrame
          key={descriptor.instanceId}
          descriptor={descriptor}
          isDesktop={isDesktop}
          viewport={viewport}
          onActivate={activateWindow}
          onClose={closeWindow}
          onRectChange={updateWindowRect}
        />
      ))}
    </div>,
    portalTarget
  )
}
