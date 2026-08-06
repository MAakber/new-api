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
