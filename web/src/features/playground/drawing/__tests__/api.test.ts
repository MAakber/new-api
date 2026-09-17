import { describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { generateImages } from '../api'
import { DEFAULT_IMAGE_SETTINGS } from '../lib/image-settings'

describe('Image request transport', () => {
  it('decodes DALL·E base64 as PNG after switching from GPT WebP output', async () => {
    const request = vi.spyOn(api, 'post').mockResolvedValue({
      headers: { 'content-type': 'application/json' },
      data: new Response(JSON.stringify({ data: [{ b64_json: 'YWJj' }] })).body,
    })
    const result = await generateImages({
      settings: {
        ...DEFAULT_IMAGE_SETTINGS,
        model: 'dall-e-3',
        quality: 'standard',
        prompt: 'A cup',
        outputFormat: 'webp',
      },
      references: [],
      signal: new AbortController().signal,
      onPartial: vi.fn(),
    })
    expect(request).toHaveBeenCalledWith(
      '/pg/images/generations',
      expect.objectContaining({ model: 'dall-e-3', group: 'default' }),
      expect.objectContaining({ adapter: 'fetch' })
    )
    expect(result.images[0]).toMatchObject({
      mimeType: 'image/png',
      src: 'data:image/png;base64,YWJj',
    })
  })
})
