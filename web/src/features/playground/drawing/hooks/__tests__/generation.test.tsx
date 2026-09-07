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
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useDrawingStore } from '@/stores/drawing-store'

import { DEFAULT_IMAGE_SETTINGS } from '../../lib/image-settings'
import { useImageGeneration } from '../use-image-generation'

const decoders: EventTarget[] = []
beforeEach(() => {
  decoders.length = 0
  useDrawingStore.getState().initialize(813)
  useDrawingStore.getState().hydrate(null)
  vi.stubGlobal(
    'Image',
    class extends EventTarget {
      naturalWidth = 512
      naturalHeight = 512
      src = ''
      constructor() {
        super()
        decoders.push(this)
      }
      set onload(callback: EventListener) {
        this.addEventListener('load', callback)
      }
      set onerror(callback: EventListener) {
        this.addEventListener('error', callback)
      }
    }
  )
  vi.spyOn(api, 'post').mockResolvedValue({
    headers: { 'content-type': 'application/json' },
    data: new Response(
      JSON.stringify({ data: [{ b64_json: 'YWJj' }, { b64_json: 'ZGVm' }] })
    ).body,
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Image generation jobs', () => {
  it('keeps successful images when another image in the same request cannot be decoded', async () => {
    const client = new QueryClient()
    const hook = renderHook(useImageGeneration, {
      wrapper: (props: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    })
    act(() =>
      hook.result.current.generate(
        {
          ...DEFAULT_IMAGE_SETTINGS,
          model: 'gpt-image-1',
          prompt: 'Two cups',
          n: 2,
        },
        { x: 0, y: 0 }
      )
    )
    await waitFor(() => expect(decoders).toHaveLength(2))
    await act(async () => {
      decoders[0].dispatchEvent(new Event('load'))
      decoders[1].dispatchEvent(new Event('error'))
    })
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    expect(
      useDrawingStore.getState().nodes.map((node) => node.data.status)
    ).toEqual(['complete', 'error'])
    expect(useDrawingStore.getState().nodes[0].data.asset?.width).toBe(512)
    hook.unmount()
    client.clear()
  })

  it('marks pending cards stopped when cancelling while returned images are still decoding', async () => {
    const client = new QueryClient()
    const hook = renderHook(useImageGeneration, {
      wrapper: (props: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    })
    act(() =>
      hook.result.current.generate(
        {
          ...DEFAULT_IMAGE_SETTINGS,
          model: 'gpt-image-1',
          prompt: 'Two cups',
          n: 2,
        },
        { x: 0, y: 0 }
      )
    )
    await waitFor(() => expect(decoders).toHaveLength(2))
    await act(async () => {
      hook.result.current.cancel()
      for (const decoder of decoders) decoder.dispatchEvent(new Event('load'))
    })
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    expect(
      useDrawingStore.getState().nodes.map((node) => node.data.status)
    ).toEqual(['cancelled', 'cancelled'])
    hook.unmount()
    client.clear()
  })
})
