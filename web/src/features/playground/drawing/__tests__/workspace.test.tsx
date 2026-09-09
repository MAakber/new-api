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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReactFlowProvider } from '@xyflow/react'
import { describe, it, expect, vi } from 'vitest'

import { api } from '@/lib/api'
import { useDrawingStore } from '@/stores/drawing-store'

import { DrawingWorkspace } from '../components/DrawingWorkspace'
import { DEFAULT_IMAGE_SETTINGS } from '../lib/image-settings'

function renderWorkspace(userId: number) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(
    ['drawing-groups', userId],
    [{ value: 'default', label: 'default', ratio: 1 }]
  )
  client.setQueryData(
    ['drawing-models', userId, 'default'],
    [{ value: 'gpt-image-1', label: 'gpt-image-1' }]
  )
  const view = render(
    <QueryClientProvider client={client}>
      <ReactFlowProvider initialWidth={1000} initialHeight={700}>
        <DrawingWorkspace userId={userId} />
      </ReactFlowProvider>
    </QueryClientProvider>
  )
  return { client, view }
}

describe('Drawing workspace', () => {
  it.each([
    { zoomButton: 'Zoom in', zoom: '120%', count: 1, userId: 851 },
    { zoomButton: 'Zoom out', zoom: '83%', count: 2, userId: 852 },
  ])(
    'keeps the $zoom canvas view when generating $count images after using $zoomButton',
    async ({ zoomButton, zoom, count, userId }) => {
      vi.spyOn(api, 'post').mockRejectedValue(
        new Error('Generation unavailable')
      )
      const user = userEvent.setup()
      const { client, view } = renderWorkspace(userId)
      try {
        await screen.findByText('Room for every idea')
        act(() =>
          useDrawingStore.getState().updateSettings({
            model: 'gpt-image-1',
            n: count,
          })
        )
        await user.type(
          screen.getByRole('textbox', { name: 'Prompt' }),
          'A cup'
        )
        await user.click(screen.getByRole('button', { name: zoomButton }))
        await waitFor(() =>
          expect(screen.getByLabelText('Zoom level').textContent).toBe(zoom)
        )
        const viewport = useDrawingStore.getState().viewport

        await user.click(
          screen.getByRole('button', { name: 'Generate images' })
        )
        await screen.findAllByText('Generation unavailable')
        // Happy DOM does not measure nodes; provide the canvas layout event.
        act(() =>
          useDrawingStore.getState().changeNodes(
            useDrawingStore.getState().nodes.map((node) => ({
              id: node.id,
              type: 'dimensions',
              dimensions: { width: 280, height: 330 },
            }))
          )
        )
        await act(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              )
            })
        )

        expect(screen.getByLabelText('Zoom level').textContent).toBe(zoom)
        expect(useDrawingStore.getState().viewport).toEqual(viewport)
        expect(screen.getAllByRole('article', { name: 'A cup' })).toHaveLength(
          count
        )
      } finally {
        view.unmount()
        client.clear()
      }
    }
  )

  it('shows the empty canvas and settings when no reference image or mask exists', async () => {
    const { client, view } = renderWorkspace(801)
    await waitFor(() =>
      expect(screen.getByText('Room for every idea')).toBeTruthy()
    )
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Generate images' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    client.clear()
  })

  it('draws the minimap SVG at the size of its compact container after adding an image', async () => {
    const { client, view } = renderWorkspace(821)
    await waitFor(() =>
      expect(screen.getByText('Room for every idea')).toBeTruthy()
    )
    act(() =>
      useDrawingStore.getState().addNodes([
        {
          id: 'overview-image',
          type: 'image',
          position: { x: 0, y: 0 },
          width: 280,
          height: 330,
          data: {
            prompt: 'Overview image',
            settings: DEFAULT_IMAGE_SETTINGS,
            status: 'error',
            createdAt: 1,
          },
        },
      ])
    )
    const overview = screen.getByTestId('rf__minimap').querySelector('svg')
    expect(overview?.getAttribute('width')).toBe('144')
    expect(overview?.getAttribute('height')).toBe('96')
    expect(overview?.getAttribute('viewBox')).not.toContain('NaN')
    view.unmount()
    client.clear()
  })
})
