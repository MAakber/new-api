import type { DrawingDocument } from '../types'
import {
  parseDrawingDocument,
  serializeDrawingDocument,
} from './canvas-document'

export async function openDrawingDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('new-api-drawing', 2)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('canvases')) {
        database.createObjectStore('canvases')
      }
      if (!database.objectStoreNames.contains('gallery')) {
        const gallery = database.createObjectStore('gallery', {
          keyPath: ['userId', 'id'],
        })
        gallery.createIndex('by-user-created', ['userId', 'createdAt', 'id'])
        database.createObjectStore('gallery-assets')
      }
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(
        new Error(
          'Canvas storage is unavailable. Export your canvas to keep a copy.'
        )
      )
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
  })
}

export async function loadDrawingDocument(
  userId: number
): Promise<DrawingDocument | null> {
  const database = await openDrawingDatabase()
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction('canvases', 'readonly')
      const request = transaction.objectStore('canvases').get(userId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return value ? parseDrawingDocument(value) : null
  } finally {
    database.close()
  }
}

export async function saveDrawingDocument(
  userId: number,
  document: DrawingDocument
): Promise<void> {
  const database = await openDrawingDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('canvases', 'readwrite')
      transaction
        .objectStore('canvases')
        .put(serializeDrawingDocument(document), userId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    database.close()
  }
}
