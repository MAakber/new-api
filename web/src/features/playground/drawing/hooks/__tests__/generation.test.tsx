import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useDrawingStore } from '@/stores/drawing-store'

import { loadGalleryPage } from '../../lib/gallery-storage'
import { DEFAULT_IMAGE_SETTINGS } from '../../lib/image-settings'
import { useDrawingGallery } from '../use-drawing-gallery'
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
  it('archives final batch outputs even when a canvas node was removed and excludes streaming previews', async () => {
    useDrawingStore.getState().initialize(913)
    useDrawingStore.getState().hydrate(null)
    let stream: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(api.post).mockResolvedValueOnce({
      headers: { 'content-type': 'text/event-stream' },
      data: new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller
        },
      }),
    })
    const client = new QueryClient()
    const hook = renderHook(
      () => {
        const gallery = useDrawingGallery(913, true)
        return { gallery, generation: useImageGeneration(gallery.archive) }
      },
      {
        wrapper: (props: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            {props.children}
          </QueryClientProvider>
        ),
      }
    )
    act(() =>
      hook.result.current.generation.generate(
        {
          ...DEFAULT_IMAGE_SETTINGS,
          model: 'gpt-image-1',
          prompt: 'Two cups',
          n: 2,
          stream: true,
        },
        { x: 0, y: 0 }
      )
    )
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce())
    await act(async () =>
      stream.enqueue(
        new TextEncoder().encode(
          'data: {"type":"image_generation.partial_image","image_index":0,"b64_json":"YWJj"}\n\n'
        )
      )
    )
    await waitFor(() =>
      expect(useDrawingStore.getState().nodes[0].data.asset).toBeDefined()
    )
    expect((await loadGalleryPage(913)).total).toBe(0)
    act(() =>
      useDrawingStore
        .getState()
        .removeNodes([useDrawingStore.getState().nodes[0].id])
    )
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          'data: {"type":"image_generation.completed","image_index":0,"b64_json":"ZGVm"}\n\ndata: {"type":"image_generation.completed","image_index":1,"b64_json":"Z2hp"}\n\n'
        )
      )
      stream.close()
    })
    await waitFor(() => expect(decoders).toHaveLength(2))
    await act(async () => {
      for (const decoder of decoders) decoder.dispatchEvent(new Event('load'))
    })
    await waitFor(async () =>
      expect((await loadGalleryPage(913)).total).toBe(2)
    )
    act(() => useDrawingStore.getState().clear())
    expect(
      (await loadGalleryPage(913)).images.map((image) => image.prompt)
    ).toEqual(['Two cups', 'Two cups'])
    hook.unmount()
    client.clear()
  })

  it('keeps a completed generation usable when gallery storage fails and retries saving without generating again', async () => {
    useDrawingStore.getState().initialize(914)
    useDrawingStore.getState().hydrate(null)
    vi.mocked(api.post).mockResolvedValueOnce({
      headers: { 'content-type': 'application/json' },
      data: new Response(JSON.stringify({ data: [{ b64_json: 'YWJj' }] })).body,
    })
    const unavailable = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'QuotaExceededError')
    })
    const client = new QueryClient()
    const hook = renderHook(
      () => {
        const gallery = useDrawingGallery(914, false)
        return { gallery, generation: useImageGeneration(gallery.archive) }
      },
      {
        wrapper: (props: { children: ReactNode }) => (
          <QueryClientProvider client={client}>
            {props.children}
          </QueryClientProvider>
        ),
      }
    )
    act(() =>
      hook.result.current.generation.generate(
        { ...DEFAULT_IMAGE_SETTINGS, model: 'gpt-image-1', prompt: 'A cup' },
        { x: 0, y: 0 }
      )
    )
    await waitFor(() => expect(decoders).toHaveLength(1))
    await act(async () => decoders[0].dispatchEvent(new Event('load')))
    await waitFor(() =>
      expect(hook.result.current.gallery.unsaved).toHaveLength(1)
    )
    expect(useDrawingStore.getState().nodes[0].data.status).toBe('complete')
    unavailable.mockRestore()
    act(() => hook.result.current.gallery.retryUnsaved())
    await waitFor(() =>
      expect(hook.result.current.gallery.unsaved).toHaveLength(0)
    )
    expect((await loadGalleryPage(914)).total).toBe(1)
    expect(api.post).toHaveBeenCalledOnce()
    hook.unmount()
    client.clear()
  })
  it('tracks streamed previews and decoding, then resets progress when retrying the failed attempt', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100000)
    let stream: ReadableStreamDefaultController<Uint8Array>
    vi.mocked(api.post).mockResolvedValueOnce({
      headers: { 'content-type': 'text/event-stream' },
      data: new ReadableStream<Uint8Array>({
        start(controller) {
          stream = controller
        },
      }),
    })
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
          prompt: 'A cup',
          stream: true,
        },
        { x: 0, y: 0 }
      )
    )
    const id = useDrawingStore.getState().nodes[0].id
    expect(useDrawingStore.getState().nodes[0].data.progress).toEqual({
      startedAt: 100000,
      phase: 'generating',
      previewCount: 0,
    })
    await waitFor(() => expect(api.post).toHaveBeenCalledOnce())
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          'data: {"type":"image_generation.partial_image","partial_image_index":0,"b64_json":"YWJj"}\n\ndata: {"type":"image_generation.partial_image","partial_image_index":1,"b64_json":"ZGVm"}\n\n'
        )
      )
    })
    await waitFor(() =>
      expect(
        useDrawingStore.getState().nodes[0].data.progress?.previewCount
      ).toBe(2)
    )
    expect(useDrawingStore.getState().nodes[0].data.asset?.src).toBe(
      'data:image/png;base64,ZGVm'
    )
    await act(async () => {
      stream.enqueue(
        new TextEncoder().encode(
          'data: {"type":"image_generation.completed","b64_json":"Z2hp"}\n\n'
        )
      )
      stream.close()
    })
    await waitFor(() => expect(decoders).toHaveLength(1))
    expect(useDrawingStore.getState().nodes[0].data.progress?.phase).toBe(
      'decoding'
    )
    await act(async () => decoders[0].dispatchEvent(new Event('error')))
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    now.mockReturnValue(200000)
    act(() => hook.result.current.retry(id))
    expect(useDrawingStore.getState().nodes[0].data.progress).toEqual({
      startedAt: 200000,
      phase: 'generating',
      previewCount: 0,
    })
    hook.unmount()
    client.clear()
  })

  it('retries only the failed image in place with its original settings and ignores repeated clicks', async () => {
    const client = new QueryClient()
    const hook = renderHook(useImageGeneration, {
      wrapper: (props: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    })
    const settings = {
      ...DEFAULT_IMAGE_SETTINGS,
      model: 'gpt-image-1',
      prompt: 'Two cups',
      n: 2,
    }
    act(() => hook.result.current.generate(settings, { x: 120, y: 240 }))
    await waitFor(() => expect(decoders).toHaveLength(2))
    await act(async () => {
      decoders[0].dispatchEvent(new Event('load'))
      decoders[1].dispatchEvent(new Event('error'))
    })
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    const [successful, failed] = useDrawingStore.getState().nodes
    act(() =>
      useDrawingStore.getState().updateSettings({
        model: 'dall-e-3',
        prompt: 'An unrelated landscape',
        n: 1,
      })
    )
    vi.mocked(api.post).mockResolvedValueOnce({
      headers: { 'content-type': 'application/json' },
      data: new Response(JSON.stringify({ data: [{ b64_json: 'Z2hp' }] })).body,
    })

    act(() => {
      hook.result.current.retry(failed.id)
      hook.result.current.retry(failed.id)
    })

    expect(hook.result.current.pendingCount).toBe(1)
    expect(useDrawingStore.getState().nodes).toHaveLength(2)
    expect(useDrawingStore.getState().nodes[0]).toEqual(successful)
    expect(useDrawingStore.getState().nodes[1]).toMatchObject({
      id: failed.id,
      position: failed.position,
      data: { status: 'pending', prompt: 'Two cups', error: undefined },
    })
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.post).mock.calls[1][1]).toMatchObject({
      model: 'gpt-image-1',
      prompt: 'Two cups',
      n: 1,
    })
    await waitFor(() => expect(decoders).toHaveLength(3))
    await act(async () => decoders[2].dispatchEvent(new Event('load')))
    await waitFor(() => expect(hook.result.current.pendingCount).toBe(0))
    expect(useDrawingStore.getState().nodes[1].data.status).toBe('complete')
    expect(useDrawingStore.getState().settings.prompt).toBe(
      'An unrelated landscape'
    )
    hook.unmount()
    client.clear()
  })

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
