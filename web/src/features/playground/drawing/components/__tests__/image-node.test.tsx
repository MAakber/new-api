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
import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider, type NodeProps } from '@xyflow/react'
import { describe, expect, it } from 'vitest'

import { useDrawingStore } from '@/stores/drawing-store'

import { DEFAULT_IMAGE_SETTINGS } from '../../lib/image-settings'
import type { DrawingNode } from '../../types'
import { ImageCanvasNode } from '../ImageCanvasNode'

describe('Canvas image result', () => {
  it('shows the final image even if its earlier streaming preview failed to load', () => {
    useDrawingStore.getState().initialize(815)
    const asset = {
      id: 'preview',
      src: 'data:image/png;base64,YWJj',
      mimeType: 'image/png',
      name: 'A cup',
      width: 512,
      height: 512,
    }
    const props: NodeProps<DrawingNode> = {
      id: 'image-result',
      type: 'image',
      data: {
        prompt: 'A cup',
        settings: DEFAULT_IMAGE_SETTINGS,
        createdAt: 1,
        status: 'pending',
        asset,
      },
      draggable: true,
      dragging: false,
      selectable: true,
      selected: false,
      deletable: true,
      isConnectable: false,
      zIndex: 0,
      positionAbsoluteX: 0,
      positionAbsoluteY: 0,
    }
    const view = render(
      <ReactFlowProvider>
        <ImageCanvasNode {...props} />
      </ReactFlowProvider>
    )
    fireEvent.error(screen.getByRole('img', { name: 'A cup' }))
    expect(screen.getByText('The image could not be loaded.')).toBeTruthy()
    view.rerender(
      <ReactFlowProvider>
        <ImageCanvasNode
          {...props}
          data={{
            ...props.data,
            status: 'complete',
            asset: { ...asset, src: 'data:image/png;base64,ZGVm' },
          }}
        />
      </ReactFlowProvider>
    )
    expect(screen.getByRole('img', { name: 'A cup' }).getAttribute('src')).toBe(
      'data:image/png;base64,ZGVm'
    )
    expect(screen.queryByText('The image could not be loaded.')).toBeNull()
  })
})
