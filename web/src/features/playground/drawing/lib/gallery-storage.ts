import type {
  GalleryCursor,
  GalleryImage,
  ImageAsset,
  ImageNodeData,
} from '../types'
import { openDrawingDatabase } from './canvas-storage'
import {
  imageAssetToFile,
  imageBlobToDataUrl,
  isSafeImageSource,
} from './image-assets'
import { normalizeStoredImageSettings } from './image-settings'

type GalleryRecord = GalleryImage | { userId: number; id: string }
export type GalleryPage = {
  images: GalleryImage[]
  total: number
  nextCursor?: GalleryCursor
}

export async function loadGalleryPage(
  userId: number,
  cursor?: GalleryCursor
): Promise<GalleryPage> {
  const database = await openDrawingDatabase()
  try {
    return await new Promise<GalleryPage>((resolve, reject) => {
      const transaction = database.transaction('gallery', 'readonly')
      const index = transaction.objectStore('gallery').index('by-user-created')
      const ownerRange = IDBKeyRange.bound([userId], [userId, []])
      const range = cursor
        ? IDBKeyRange.bound(
            [userId],
            [userId, cursor.createdAt, cursor.id],
            false,
            true
          )
        : ownerRange
      const count = index.count(ownerRange)
      const request = index.openCursor(range, 'prev')
      const images: GalleryImage[] = []
      request.onsuccess = () => {
        const entry = request.result
        if (!entry || images.length === 25) return
        images.push(entry.value as GalleryImage)
        entry.continue()
      }
      transaction.oncomplete = () => {
        const hasMore = images.length > 24
        if (hasMore) images.pop()
        const last = images.at(-1)
        resolve({
          images,
          total: count.result,
          nextCursor:
            hasMore && last
              ? { createdAt: last.createdAt, id: last.id }
              : undefined,
        })
      }
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function saveGalleryImage(
  userId: number,
  data: ImageNodeData,
  retry = false
): Promise<GalleryImage | null> {
  const asset = data.asset
  if (data.status !== 'complete' || !asset || !isSafeImageSource(asset.src)) {
    return null
  }
  const key = [userId, asset.id]
  const database = await openDrawingDatabase()
  try {
    const existing = await new Promise<GalleryRecord | undefined>(
      (resolve, reject) => {
        const request = database
          .transaction('gallery', 'readonly')
          .objectStore('gallery')
          .get(key)
        request.onsuccess = () =>
          resolve(request.result as GalleryRecord | undefined)
        request.onerror = () => reject(request.error)
      }
    )
    if (existing && !('createdAt' in existing)) return null
    if (existing && (!retry || !existing.sourceUrl)) return existing

    let file: File | undefined
    try {
      file = await imageAssetToFile(asset, AbortSignal.timeout(20000))
    } catch {
      // A provider may allow displaying a URL but disallow reading it through CORS.
      // Preserve the record and explicitly identify it as a remote image in the UI.
      if (asset.src.startsWith('data:')) {
        throw new Error('The image could not be saved to the gallery.')
      }
    }
    let thumbnail: string | undefined
    if (file && typeof createImageBitmap === 'function') {
      let bitmap: ImageBitmap | undefined
      try {
        const scale = Math.min(1, 320 / Math.max(asset.width, asset.height))
        bitmap = await createImageBitmap(file, {
          resizeWidth: Math.max(1, Math.round(asset.width * scale)),
          resizeHeight: Math.max(1, Math.round(asset.height * scale)),
          resizeQuality: 'high',
        })
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d')
        if (context) {
          context.drawImage(bitmap, 0, 0)
          const source = canvas.toDataURL('image/webp', 0.8)
          if (isSafeImageSource(source)) thumbnail = source
        }
      } catch {
        // The original stays usable when the browser cannot create a thumbnail.
      } finally {
        bitmap?.close()
      }
    }
    const image: GalleryImage = {
      id: asset.id,
      userId,
      name: asset.name,
      mimeType: file?.type || asset.mimeType,
      width: asset.width,
      height: asset.height,
      prompt: data.prompt,
      settings: normalizeStoredImageSettings(data.settings),
      revisedPrompt: data.revisedPrompt,
      createdAt: data.createdAt,
      thumbnail,
      sourceUrl: file ? undefined : asset.src,
    }
    const bytes = await file?.arrayBuffer()
    return await new Promise<GalleryImage | null>((resolve, reject) => {
      const transaction = database.transaction(
        ['gallery', 'gallery-assets'],
        'readwrite'
      )
      const gallery = transaction.objectStore('gallery')
      const request = gallery.get(key)
      let saved: GalleryImage | null = image
      request.onsuccess = () => {
        const current = request.result as GalleryRecord | undefined
        // A delete leaves a small tombstone so reopening/importing a canvas cannot
        // silently restore a deleted work. This also handles concurrent tabs.
        if (current && !('createdAt' in current)) {
          saved = null
          return
        }
        if (current && (!retry || !current.sourceUrl)) {
          saved = current
          return
        }
        gallery.put(image)
        if (bytes) {
          transaction
            .objectStore('gallery-assets')
            .put({ bytes, mimeType: image.mimeType }, key)
        }
      }
      transaction.oncomplete = () => resolve(saved)
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}

export async function loadGalleryBlob(
  userId: number,
  id: string
): Promise<Blob | undefined> {
  const database = await openDrawingDatabase()
  try {
    return await new Promise<Blob | undefined>((resolve, reject) => {
      const request = database
        .transaction('gallery-assets', 'readonly')
        .objectStore('gallery-assets')
        .get([userId, id])
      request.onsuccess = () => {
        const stored = request.result as
          | { bytes: ArrayBuffer; mimeType: string }
          | undefined
        resolve(
          stored
            ? new Blob([stored.bytes], { type: stored.mimeType })
            : undefined
        )
      }
      request.onerror = () => reject(request.error)
    })
  } finally {
    database.close()
  }
}

export async function loadGalleryAsset(
  image: GalleryImage
): Promise<ImageAsset> {
  const blob = await loadGalleryBlob(image.userId, image.id)
  const src = blob ? await imageBlobToDataUrl(blob) : image.sourceUrl
  if (!src || !isSafeImageSource(src)) {
    throw new Error('The image could not be loaded.')
  }
  return {
    id: image.id,
    name: image.name,
    width: image.width,
    height: image.height,
    mimeType: image.mimeType,
    src,
  }
}

export async function deleteGalleryImage(
  userId: number,
  id: string
): Promise<void> {
  const database = await openDrawingDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        ['gallery', 'gallery-assets'],
        'readwrite'
      )
      transaction.objectStore('gallery').put({ userId, id })
      transaction.objectStore('gallery-assets').delete([userId, id])
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}
