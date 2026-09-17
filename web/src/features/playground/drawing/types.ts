import type { Node, Edge, Viewport } from '@xyflow/react'
import type { z } from 'zod'

import type { imageSettingsSchema } from './lib/image-settings'

export type ImageSettings = z.infer<typeof imageSettingsSchema>
export type ImageAsset = {
  id: string
  name: string
  src: string
  width: number
  height: number
  mimeType: string
}
export type ImageNodeData = {
  asset?: ImageAsset
  origin?: 'generated' | 'uploaded' | 'gallery'
  prompt: string
  settings: ImageSettings
  status: 'pending' | 'complete' | 'error' | 'cancelled'
  error?: string
  revisedPrompt?: string
  jobId?: string
  createdAt: number
  progress?: ImageGenerationProgress
  referenceIds?: string[]
  mask?: ImageAsset
  usage?: Record<string, unknown>
}
export type ImageGenerationProgress = {
  startedAt: number
  phase: 'generating' | 'decoding'
  previewCount: number
}
export type DrawingNode = Node<ImageNodeData, 'image'>
export type DrawingMask = { referenceId: string; asset: ImageAsset }
export type DrawingDocument = {
  version: 1
  nodes: DrawingNode[]
  edges: Edge[]
  viewport: Viewport
  settings: ImageSettings
  referenceIds: string[]
  mask: DrawingMask | null
}
export type ImageResult = {
  src: string
  mimeType: string
  revisedPrompt?: string
}
export type ImageResponse = {
  data?: { b64_json?: string; url?: string; revised_prompt?: string }[]
  output_format?: string
  usage?: Record<string, unknown>
  error?: { message?: string }
}

export type GalleryImage = Omit<ImageAsset, 'src'> & {
  userId: number
  prompt: string
  settings: ImageSettings
  revisedPrompt?: string
  createdAt: number
  thumbnail?: string
  sourceUrl?: string
}

export type GalleryCursor = Pick<GalleryImage, 'createdAt' | 'id'>
