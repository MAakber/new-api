import { lazy, Suspense } from 'react'

import type { FloatingWindowDescriptor } from './types'

const ChannelEditorWindowContent = lazy(async () => {
  const module =
    await import('@/features/channels/components/drawers/channel-mutate-drawer')

  return { default: module.ChannelEditorWindowContent }
})

export type FloatingWindowContentProps = {
  descriptor: FloatingWindowDescriptor
  requestClose: () => void
  forceClose: () => void
  onDirtyChange: (dirty: boolean) => void
}

function WindowContentLoadingState() {
  return (
    <div className='flex h-full items-center justify-center p-6'>
      <div className='border-primary size-6 animate-spin rounded-full border-2 border-t-transparent' />
    </div>
  )
}

export function FloatingWindowContent(props: FloatingWindowContentProps) {
  if (props.descriptor.kind === 'channel-editor') {
    return (
      <Suspense fallback={<WindowContentLoadingState />}>
        <ChannelEditorWindowContent
          instanceId={props.descriptor.instanceId}
          mode={props.descriptor.mode}
          channelId={props.descriptor.channelId}
          onRequestClose={props.requestClose}
          onSuccessClose={props.forceClose}
          onDirtyChange={props.onDirtyChange}
        />
      </Suspense>
    )
  }

  return null
}
