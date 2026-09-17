import { isAxiosError } from 'axios'

import { api } from '@/lib/api'

import { imageAssetToFile } from './lib/image-assets'
import {
  buildImagePayload,
  getImageModelFamily,
  validateImageSettings,
} from './lib/image-settings'
import { parseImageResponse, readImageStream } from './lib/image-stream'
import type {
  ImageAsset,
  ImageResponse,
  ImageResult,
  ImageSettings,
} from './types'

export type GenerateImagesOptions = {
  settings: ImageSettings
  references: ImageAsset[]
  mask?: ImageAsset
  signal: AbortSignal
  onPartial: (result: ImageResult, index: number) => void
}

export async function generateImages(options: GenerateImagesOptions): Promise<{
  images: ImageResult[]
  usage?: Record<string, unknown>
}> {
  const validation = validateImageSettings(
    options.settings,
    options.references.length
  )
  if (validation) throw new Error(validation)
  const payload = buildImagePayload(options.settings)
  let body: Record<string, string | number | boolean> | FormData = payload
  if (options.settings.mode === 'edit') {
    if (
      options.mask &&
      (options.mask.mimeType !== 'image/png' ||
        options.mask.width !== options.references[0].width ||
        options.mask.height !== options.references[0].height)
    ) {
      throw new Error(
        'The mask must be a PNG with the same dimensions as the first reference image.'
      )
    }
    const files = await Promise.all(
      options.references.map((asset) => imageAssetToFile(asset, options.signal))
    )
    if (
      getImageModelFamily(options.settings.model) === 'dall-e-2' &&
      (files[0].type !== 'image/png' ||
        files[0].size >= 4 * 1024 * 1024 ||
        options.references[0].width !== options.references[0].height)
    ) {
      throw new Error('DALL·E 2 requires a square PNG smaller than 4 MB.')
    }
    const form = new FormData()
    for (const [key, value] of Object.entries(payload)) {
      form.append(key, String(value))
    }
    for (const file of files) {
      form.append(files.length === 1 ? 'image' : 'image[]', file)
    }
    if (options.mask) {
      const mask = await imageAssetToFile(options.mask, options.signal)
      if (mask.size >= 4 * 1024 * 1024) {
        throw new Error('The mask must be smaller than 4 MB.')
      }
      form.append('mask', mask)
    }
    body = form
  }
  options.signal.throwIfAborted()
  const endpoint =
    options.settings.mode === 'edit'
      ? '/pg/images/edits'
      : '/pg/images/generations'
  const outputFormat =
    getImageModelFamily(options.settings.model) === 'gpt-image'
      ? options.settings.outputFormat
      : 'png'
  try {
    // The shared client supplies account authentication, rotation and credentials.
    const response = await api.post<ReadableStream<Uint8Array>>(
      endpoint,
      body,
      {
        adapter: 'fetch',
        responseType: 'stream',
        signal: options.signal,
        skipErrorHandler: true,
        skipBusinessError: true,
      }
    )
    if (
      String(response.headers['content-type']).includes('text/event-stream')
    ) {
      return await readImageStream(
        response.data,
        outputFormat,
        options.onPartial,
        options.signal
      )
    }
    const data = (await new Response(response.data).json()) as ImageResponse
    options.signal.throwIfAborted()
    return { images: parseImageResponse(data, outputFormat), usage: data.usage }
  } catch (error) {
    if (options.signal.aborted) throw options.signal.reason
    if (
      isAxiosError<ReadableStream<Uint8Array>>(error) &&
      error.response?.data
    ) {
      const data = (await new Response(error.response.data)
        .json()
        .catch(() => null)) as ImageResponse | null
      throw new Error(data?.error?.message || 'Image generation failed.')
    }
    throw error
  }
}
