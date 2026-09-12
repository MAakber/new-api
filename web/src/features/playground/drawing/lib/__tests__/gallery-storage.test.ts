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
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDrawingStore } from '@/stores/drawing-store'

import type { ImageNodeData } from '../../types'
import { loadDrawingDocument, saveDrawingDocument } from '../canvas-storage'
import {
  deleteGalleryImage,
  loadGalleryAsset,
  loadGalleryBlob,
  loadGalleryPage,
  saveGalleryImage,
} from '../gallery-storage'
import { DEFAULT_IMAGE_SETTINGS } from '../image-settings'

const image = {
  asset: {
    id: 'cup',
    name: 'cup.png',
    src: 'data:image/png;base64,YWJj',
    width: 512,
    height: 512,
    mimeType: 'image/png',
  },
  prompt: 'A ceramic cup',
  settings: {
    ...DEFAULT_IMAGE_SETTINGS,
    model: 'gpt-image-1',
    prompt: 'A ceramic cup',
  },
  status: 'complete',
  origin: 'generated',
  createdAt: 100,
} satisfies ImageNodeData

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => vi.unstubAllGlobals())

describe('Gallery storage', () => {
  it('upgrades a version-one database without losing the canvas and reopens idempotently', async () => {
    useDrawingStore.getState().initialize(901)
    const document = {
      version: 1,
      nodes: [],
      edges: [],
      viewport: { x: 40, y: 40, zoom: 1 },
      settings: { ...DEFAULT_IMAGE_SETTINGS, prompt: 'A saved draft' },
      referenceIds: [],
      mask: null,
    }
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('new-api-drawing', 1)
      request.onupgradeneeded = () =>
        request.result.createObjectStore('canvases')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('canvases', 'readwrite')
        transaction.objectStore('canvases').put(document, 901)
        transaction.oncomplete = () => {
          database.close()
          resolve()
        }
        transaction.onerror = () => reject(transaction.error)
      }
    })
    expect((await loadGalleryPage(901)).total).toBe(0)
    expect((await loadDrawingDocument(901))?.settings.prompt).toBe(
      'A saved draft'
    )
    expect((await loadGalleryPage(901)).total).toBe(0)
    expect((await loadDrawingDocument(901))?.settings.prompt).toBe(
      'A saved draft'
    )
  })

  it('keeps image bytes and settings after clearing the canvas and isolates accounts', async () => {
    await saveGalleryImage(901, image)
    useDrawingStore.getState().initialize(901)
    useDrawingStore.getState().clear()
    await saveDrawingDocument(901, useDrawingStore.getState())

    const page = await loadGalleryPage(901)
    expect(page.total).toBe(1)
    expect(page.images[0]).toMatchObject({
      prompt: image.prompt,
      settings: image.settings,
      width: 512,
      height: 512,
    })
    expect(await loadGalleryAsset(page.images[0])).toMatchObject(image.asset)
    expect(await (await loadGalleryBlob(901, 'cup'))?.text()).toBe('abc')
    expect((await loadGalleryPage(902)).images).toEqual([])
    expect(await loadGalleryBlob(902, 'cup')).toBeUndefined()
  })

  it('deduplicates concurrent saves and does not restore a deleted image when its canvas reopens', async () => {
    await Promise.all([
      saveGalleryImage(901, image),
      saveGalleryImage(901, image),
    ])
    await saveGalleryImage(902, image)
    expect((await loadGalleryPage(901)).total).toBe(1)
    await deleteGalleryImage(901, 'cup')
    await saveGalleryImage(901, image)
    expect((await loadGalleryPage(901)).total).toBe(0)
    expect(await loadGalleryBlob(901, 'cup')).toBeUndefined()
    expect((await loadGalleryPage(902)).total).toBe(1)
  })

  it('paginates equal-time outputs without duplicates when a newer output arrives', async () => {
    for (let index = 0; index < 25; index++) {
      await saveGalleryImage(901, {
        ...image,
        asset: { ...image.asset, id: `work-${String(index).padStart(2, '0')}` },
      })
    }
    const first = await loadGalleryPage(901)
    expect(first.images).toHaveLength(24)
    expect(first.images[0].id).toBe('work-24')
    expect(first.nextCursor).toEqual({ createdAt: 100, id: 'work-01' })
    await saveGalleryImage(901, { ...image, createdAt: 200 })
    const second = await loadGalleryPage(901, first.nextCursor)
    expect(second.images.map((entry) => entry.id)).toEqual(['work-00'])
    expect(second.total).toBe(26)
    expect(second.nextCursor).toBeUndefined()
  })

  it('marks an unreadable provider link as remote and can replace it with a durable local copy', async () => {
    const source = 'https://images.example.test/cup.png'
    const remote = { ...image, asset: { ...image.asset, src: source } }
    const fetchImage = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('Failed to fetch'))
    await saveGalleryImage(901, remote)
    expect((await loadGalleryPage(901)).images[0].sourceUrl).toBe(source)
    fetchImage.mockResolvedValue(
      new Response('abc', { headers: { 'content-type': 'image/png' } })
    )
    await saveGalleryImage(901, remote, true)
    const saved = (await loadGalleryPage(901)).images[0]
    expect(saved.sourceUrl).toBeUndefined()
    expect((await loadGalleryAsset(saved)).src).toBe(image.asset?.src)
  })

  it('ignores previews, failed outputs and unsafe image URLs', async () => {
    await saveGalleryImage(901, { ...image, status: 'pending' })
    await saveGalleryImage(901, { ...image, status: 'error' })
    await saveGalleryImage(901, {
      ...image,
      asset: { ...image.asset, src: 'javascript:alert(1)' },
    })
    expect((await loadGalleryPage(901)).total).toBe(0)
  })
})
