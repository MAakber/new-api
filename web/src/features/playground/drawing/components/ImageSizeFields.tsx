import { MagicWand01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

import {
  getImageSizes,
  supportsCustomImageSize,
  validateImageSize,
} from '../lib/image-settings'
import { getImageSizePresets } from '../lib/image-size-presets'

const RESOLUTION_LABELS: Record<number, string> = {
  1024: '1K',
  2048: '2K',
  3840: '4K',
}

export function ImageSizeFields(props: {
  model: string
  size: string
  onChange: (size: string) => void
}) {
  const { t } = useTranslation()
  const id = useId()
  const [customSize, setCustomSize] = useState<string | null>(null)
  const presets = getImageSizePresets(props.model)
  const ratios = [...new Set(presets.map((preset) => preset.aspectRatio))]
  const resolutions = [
    ...new Set(presets.map((preset) => preset.resolution)),
  ].sort((left, right) => left - right)
  const supportsCustom = supportsCustomImageSize(props.model)
  const selectedPreset = presets.find((preset) => preset.size === props.size)
  const [width = '', height = ''] = props.size.split('x')
  let selectedRatio = selectedPreset?.aspectRatio
  if (props.size === 'auto') selectedRatio = 'auto'
  else if (!selectedRatio) {
    selectedRatio = ratios.find((ratio) => {
      const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
      return Number(width) * ratioHeight === Number(height) * ratioWidth
    })
  }
  if (getImageSizes(props.model).includes('auto')) ratios.unshift('auto')
  const custom =
    supportsCustom &&
    (customSize === props.size || (!selectedPreset && props.size !== 'auto'))
  const selectedResolution = custom
    ? 'custom'
    : selectedPreset?.resolution.toString()
  const sizeError = validateImageSize(props.model, props.size)

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <Label id={`${id}-ratio`}>{t('Aspect ratio')}</Label>
        <ToggleGroup
          aria-labelledby={`${id}-ratio`}
          value={selectedRatio ? [selectedRatio] : []}
          variant='outline'
          spacing={2}
          className='grid w-full grid-cols-4'
          onValueChange={(values) => {
            const ratio = String(values[0] || '')
            if (!ratio) return
            setCustomSize(null)
            if (ratio === 'auto') {
              props.onChange('auto')
              return
            }
            const resolution =
              selectedPreset?.resolution ||
              Math.max(Number(width), Number(height)) ||
              1024
            const compatible = presets.filter(
              (preset) => preset.aspectRatio === ratio
            )
            const next = compatible.reduce((closest, preset) =>
              Math.abs(preset.resolution - resolution) <
              Math.abs(closest.resolution - resolution)
                ? preset
                : closest
            )
            props.onChange(next.size)
          }}
        >
          {ratios.map((ratio) => {
            const [ratioWidth, ratioHeight] = ratio.split(':').map(Number)
            const longest = Math.max(ratioWidth, ratioHeight)
            return (
              <ToggleGroupItem
                key={ratio}
                value={ratio}
                aria-label={ratio === 'auto' ? t('Auto') : ratio}
                className='aria-pressed:border-foreground/40 aria-pressed:bg-muted aria-pressed:text-foreground h-18 w-full min-w-0 flex-col gap-2 rounded-xl px-1 py-2 text-sm'
              >
                <span
                  className='flex h-6 items-center justify-center'
                  aria-hidden='true'
                >
                  {ratio === 'auto' ? (
                    <HugeiconsIcon icon={MagicWand01Icon} size={22} />
                  ) : (
                    <span
                      className='rounded-[3px] border-[1.5px] border-current'
                      style={{
                        width: (22 * ratioWidth) / longest,
                        height: (22 * ratioHeight) / longest,
                      }}
                    />
                  )}
                </span>
                {ratio === 'auto' ? t('Auto') : ratio}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
      <div className='space-y-2'>
        <Label id={`${id}-resolution`}>{t('Resolution')}</Label>
        <ToggleGroup
          aria-labelledby={`${id}-resolution`}
          aria-describedby={`${id}-size`}
          value={selectedResolution ? [selectedResolution] : []}
          variant='outline'
          spacing={2}
          className='w-full'
          onValueChange={(values) => {
            const resolution = String(values[0] || '')
            if (!resolution) return
            if (resolution === 'custom') {
              const size = props.size === 'auto' ? '1024x1024' : props.size
              setCustomSize(size)
              props.onChange(size)
              return
            }
            const next = presets.find(
              (preset) =>
                preset.aspectRatio === selectedRatio &&
                preset.resolution === Number(resolution)
            )
            if (!next) return
            setCustomSize(null)
            props.onChange(next.size)
          }}
        >
          {resolutions.map((resolution) => (
            <ToggleGroupItem
              key={resolution}
              value={resolution.toString()}
              className='aria-pressed:border-foreground/40 aria-pressed:bg-muted aria-pressed:text-foreground h-9 min-w-0 flex-1 rounded-full px-1 text-xs'
              disabled={
                !presets.some(
                  (preset) =>
                    preset.aspectRatio === selectedRatio &&
                    preset.resolution === resolution
                )
              }
            >
              {RESOLUTION_LABELS[resolution] ||
                t('{{value}} px', { value: resolution })}
            </ToggleGroupItem>
          ))}
          {supportsCustom && (
            <ToggleGroupItem
              value='custom'
              className='aria-pressed:border-foreground/40 aria-pressed:bg-muted aria-pressed:text-foreground h-9 shrink-0 rounded-full px-3 text-xs'
            >
              {t('Custom')}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
        <p
          id={`${id}-size`}
          role='status'
          className='text-muted-foreground text-xs leading-relaxed'
        >
          {props.size === 'auto'
            ? t('The model chooses the image size.')
            : t('Output size: {{size}} px', {
                size: props.size.replace('x', ' × '),
              })}
        </p>
      </div>
      {custom && (
        <div className='space-y-2'>
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1.5'>
              <Label htmlFor={`${id}-width`}>{t('Width (px)')}</Label>
              <Input
                id={`${id}-width`}
                type='number'
                min={16}
                max={3840}
                step={16}
                value={width}
                aria-invalid={Boolean(sizeError)}
                onChange={(event) => {
                  const size = `${event.target.value}x${height}`
                  setCustomSize(size)
                  props.onChange(size)
                }}
              />
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor={`${id}-height`}>{t('Height (px)')}</Label>
              <Input
                id={`${id}-height`}
                type='number'
                min={16}
                max={3840}
                step={16}
                value={height}
                aria-invalid={Boolean(sizeError)}
                onChange={(event) => {
                  const size = `${width}x${event.target.value}`
                  setCustomSize(size)
                  props.onChange(size)
                }}
              />
            </div>
          </div>
          {sizeError && (
            <p role='alert' className='text-destructive text-xs'>
              {t(sizeError)}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
