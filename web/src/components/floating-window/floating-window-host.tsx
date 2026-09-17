import { AnimatePresence } from 'motion/react'
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
      <AnimatePresence initial={false}>
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
      </AnimatePresence>
    </div>,
    portalTarget
  )
}
