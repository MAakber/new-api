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
import { motion, useReducedMotion } from 'motion/react'
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'

import { FloatingWindowContent } from './content-registry'
import {
  clampFloatingWindowRect,
  FLOATING_WINDOW_MIN_HEIGHT,
  FLOATING_WINDOW_MIN_WIDTH,
} from './geometry'
import type {
  FloatingWindowDescriptor,
  FloatingWindowRect,
  FloatingWindowViewport,
} from './types'

type FloatingWindowFrameProps = {
  descriptor: FloatingWindowDescriptor
  isDesktop: boolean
  viewport: FloatingWindowViewport | null
  onActivate: (instanceId: string) => void
  onClose: (instanceId: string) => void
  onRectChange: (instanceId: string, rect: FloatingWindowRect) => void
}

type WindowInteraction = {
  kind: 'drag' | 'resize'
  pointerId: number
  startX: number
  startY: number
  rect: FloatingWindowRect
}

function getWindowStyle(
  descriptor: FloatingWindowDescriptor,
  isDesktop: boolean,
  rect: FloatingWindowRect
): CSSProperties {
  const style: CSSProperties = {
    zIndex: descriptor.order,
  }

  if (isDesktop) {
    style.left = rect.x
    style.top = rect.y
    style.width = rect.width
    style.height = rect.height
  }

  return style
}

export function FloatingWindowFrame(props: FloatingWindowFrameProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()
  const interactionRef = useRef<WindowInteraction | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const titleId = `floating-window-title-${props.descriptor.instanceId}`
  const rect =
    props.isDesktop && props.viewport
      ? clampFloatingWindowRect(props.descriptor.rect, props.viewport)
      : props.descriptor.rect
  const activateWindow = () => {
    props.onActivate(props.descriptor.instanceId)
  }

  const startInteraction = (
    event: ReactPointerEvent<HTMLElement>,
    kind: WindowInteraction['kind']
  ) => {
    if (!props.isDesktop || !event.isPrimary || event.button !== 0) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    interactionRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rect: { ...rect },
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current
    if (
      !interaction ||
      interaction.pointerId !== event.pointerId ||
      !props.viewport
    ) {
      return
    }

    const deltaX = event.clientX - interaction.startX
    const deltaY = event.clientY - interaction.startY
    let nextRect: FloatingWindowRect

    if (interaction.kind === 'drag') {
      nextRect = {
        ...interaction.rect,
        x: interaction.rect.x + deltaX,
        y: interaction.rect.y + deltaY,
      }
    } else {
      nextRect = {
        ...interaction.rect,
        width: Math.max(
          FLOATING_WINDOW_MIN_WIDTH,
          interaction.rect.width + deltaX
        ),
        height: Math.max(
          FLOATING_WINDOW_MIN_HEIGHT,
          interaction.rect.height + deltaY
        ),
      }
    }

    event.preventDefault()
    props.onRectChange(
      props.descriptor.instanceId,
      clampFloatingWindowRect(nextRect, props.viewport)
    )
  }

  const endInteraction = (event: ReactPointerEvent<HTMLElement>) => {
    if (interactionRef.current?.pointerId === event.pointerId) {
      interactionRef.current = null
    }
  }

  const forceCloseWindow = () => {
    props.onClose(props.descriptor.instanceId)
  }

  const requestCloseWindow = () => {
    if (isDirty) {
      setConfirmCloseOpen(true)
      return
    }

    forceCloseWindow()
  }

  return (
    <motion.section
      role='dialog'
      aria-modal={false}
      aria-labelledby={titleId}
      tabIndex={-1}
      className={
        props.isDesktop
          ? 'bg-background text-foreground pointer-events-auto absolute flex origin-center flex-col overflow-hidden rounded-lg border shadow-2xl outline-none'
          : 'bg-background text-foreground pointer-events-auto absolute inset-0 flex h-[100dvh] w-screen origin-center flex-col overflow-hidden outline-none'
      }
      style={getWindowStyle(props.descriptor, props.isDesktop, rect)}
      initial={
        shouldReduceMotion ? false : MOTION_VARIANTS.floatingWindow.initial
      }
      animate={MOTION_VARIANTS.floatingWindow.animate}
      exit={
        shouldReduceMotion ? undefined : MOTION_VARIANTS.floatingWindow.exit
      }
      transition={
        shouldReduceMotion ? MOTION_TRANSITION.none : MOTION_TRANSITION.default
      }
      onPointerDown={activateWindow}
      onFocusCapture={activateWindow}
      onPointerMove={handlePointerMove}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
    >
      <header
        className={
          props.isDesktop
            ? 'bg-muted/40 flex shrink-0 cursor-move touch-none items-center gap-3 border-b px-3 py-2.5 select-none'
            : 'bg-muted/40 flex shrink-0 items-center gap-3 border-b px-3 py-2.5'
        }
        onPointerDown={
          props.isDesktop
            ? (event) => startInteraction(event, 'drag')
            : undefined
        }
      >
        <h2
          id={titleId}
          className='min-w-0 flex-1 truncate text-sm font-medium'
        >
          {t(props.descriptor.title)}
        </h2>
        <button
          type='button'
          aria-label={t('Close')}
          className='text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-sm outline-none focus-visible:ring-2'
          onPointerDown={(event) => event.stopPropagation()}
          onClick={requestCloseWindow}
        >
          <span aria-hidden='true' className='text-lg leading-none'>
            ×
          </span>
        </button>
      </header>

      <div className='min-h-0 min-w-0 flex-1 overflow-auto'>
        <FloatingWindowContent
          descriptor={props.descriptor}
          requestClose={requestCloseWindow}
          forceClose={forceCloseWindow}
          onDirtyChange={setIsDirty}
        />
      </div>

      {props.isDesktop && (
        <div
          aria-hidden='true'
          className='after:border-muted-foreground/60 absolute right-0 bottom-0 size-5 cursor-se-resize touch-none after:absolute after:right-1 after:bottom-1 after:size-2 after:border-r after:border-b'
          onPointerDown={(event) => startInteraction(event, 'resize')}
        />
      )}

      <ConfirmDialog
        open={confirmCloseOpen}
        onOpenChange={setConfirmCloseOpen}
        title={t('Unsaved changes')}
        desc={t('You have unsaved changes. Are you sure you want to leave?')}
        confirmText={t('Leave')}
        cancelBtnText={t('Stay')}
        destructive
        handleConfirm={forceCloseWindow}
      />
    </motion.section>
  )
}
