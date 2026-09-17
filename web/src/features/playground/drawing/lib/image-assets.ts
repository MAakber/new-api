import type { ImageAsset } from '../types'

export const MAX_IMAGE_BYTES = 50 * 1024 * 1024
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export function isSafeImageSource(source: string): boolean {
  if (/^data:image\/(?:png|jpeg|webp);base64,[a-zA-Z0-9+/=\s]+$/.test(source)) {
    return true
  }
  try {
    const url = new URL(source)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export async function imageSourceToAsset(
  source: string,
  name: string,
  mimeType: string,
  signal?: AbortSignal
): Promise<ImageAsset> {
  if (!isSafeImageSource(source)) {
    throw new Error('The image response is invalid.')
  }
  signal?.throwIfAborted()
  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image()
      const cancel = () => {
        image.src = ''
        reject(signal?.reason)
      }
      signal?.addEventListener('abort', cancel, { once: true })
      image.addEventListener(
        'load',
        () => {
          signal?.removeEventListener('abort', cancel)
          resolve({ width: image.naturalWidth, height: image.naturalHeight })
        },
        { once: true }
      )
      image.addEventListener(
        'error',
        () => {
          signal?.removeEventListener('abort', cancel)
          reject(new Error('The image could not be loaded.'))
        },
        { once: true }
      )
      image.src = source
    }
  )
  return {
    id: crypto.randomUUID(),
    name: name.slice(0, 512),
    src: source,
    mimeType,
    ...dimensions,
  }
}

export async function imageFileToAsset(file: File): Promise<ImageAsset> {
  if (!IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image.')
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('Each reference image must be smaller than 50 MB.')
  }
  const source = await imageBlobToDataUrl(file)
  return imageSourceToAsset(source, file.name, file.type)
}

export function imageBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('The image could not be loaded.'))
    reader.readAsDataURL(blob)
  })
}

export async function imageAssetToFile(
  asset: ImageAsset,
  signal?: AbortSignal
): Promise<File> {
  if (!isSafeImageSource(asset.src)) {
    throw new Error('The image response is invalid.')
  }
  const response = await fetch(asset.src, {
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
  })
  if (!response.ok) {
    throw new Error(
      'The reference image could not be read. Try uploading it again.'
    )
  }
  const blob = await response.blob()
  if (!IMAGE_MIME_TYPES.includes(blob.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image.')
  }
  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Each reference image must be smaller than 50 MB.')
  }
  const extension = blob.type.split('/')[1]
  return new File([blob], `${asset.id}.${extension}`, { type: blob.type })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  // Give the browser time to start reading the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
