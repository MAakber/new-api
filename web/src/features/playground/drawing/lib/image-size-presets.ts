import {
  getImageSizes,
  supportsCustomImageSize,
  validateImageSize,
} from './image-settings'

export type ImageSizePreset = {
  aspectRatio: string
  resolution: number
  size: string
}

const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9']

export function getImageSizePresets(model: string): ImageSizePreset[] {
  const presets: ImageSizePreset[] = []
  if (!supportsCustomImageSize(model)) {
    for (const size of getImageSizes(model)) {
      if (size === 'auto') continue
      const [width, height] = size.split('x').map(Number)
      let divisor = width
      let remainder = height
      while (remainder) {
        const next = divisor % remainder
        divisor = remainder
        remainder = next
      }
      presets.push({
        aspectRatio: `${width / divisor}:${height / divisor}`,
        resolution: Math.max(width, height),
        size,
      })
    }
    return presets
  }

  for (const aspectRatio of ASPECT_RATIOS) {
    const [widthRatio, heightRatio] = aspectRatio.split(':').map(Number)
    // Presets use the longer edge; 4K is UHD (3840 px). Keep the exact
    // aspect ratio on the request's 16-pixel grid without exceeding the tier.
    for (const resolution of [1024, 2048, 3840]) {
      const scale =
        Math.floor(resolution / (16 * Math.max(widthRatio, heightRatio))) * 16
      const width = widthRatio * scale
      const height = heightRatio * scale
      const size = `${width}x${height}`
      if (validateImageSize(model, size)) continue
      presets.push({ aspectRatio, resolution, size })
    }
  }
  return presets
}
