import { Image02Icon, Link01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { loadGalleryBlob } from '../lib/gallery-storage'
import type { GalleryImage } from '../types'

export function GalleryImageCard(props: {
  image: GalleryImage
  onPreview: () => void
}) {
  const { t } = useTranslation()
  const [localUrl, setLocalUrl] = useState<string>()
  const [failedSource, setFailedSource] = useState<string>()
  const source = props.image.thumbnail || props.image.sourceUrl || localUrl
  useEffect(() => {
    if (props.image.thumbnail || props.image.sourceUrl) return
    let active = true
    let url: string | undefined
    void loadGalleryBlob(props.image.userId, props.image.id)
      .then((blob) => {
        if (!active || !blob) return
        url = URL.createObjectURL(blob)
        setLocalUrl(url)
      })
      .catch(() => {
        // Preview offers a retry when the local file cannot be read.
      })
    return () => {
      active = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [
    props.image.id,
    props.image.userId,
    props.image.thumbnail,
    props.image.sourceUrl,
  ])

  return (
    <Button
      type='button'
      variant='ghost'
      className='group h-auto min-w-0 flex-col items-stretch gap-0 overflow-hidden rounded-lg border p-0 text-left font-normal'
      aria-label={t('Preview {{name}}', {
        name: props.image.prompt || props.image.name,
      })}
      onClick={props.onPreview}
    >
      <span className='bg-muted/40 relative flex aspect-square w-full items-center justify-center overflow-hidden'>
        {source && source !== failedSource ? (
          <img
            src={source}
            alt=''
            loading='lazy'
            decoding='async'
            draggable={false}
            className='size-full object-contain'
            onError={() => setFailedSource(source)}
          />
        ) : (
          <HugeiconsIcon
            icon={Image02Icon}
            className='text-muted-foreground'
            size={24}
            aria-hidden='true'
          />
        )}
        {props.image.sourceUrl && (
          <span
            className='bg-background/90 absolute right-1 bottom-1 rounded p-1'
            title={t('Local copy unavailable')}
          >
            <HugeiconsIcon icon={Link01Icon} size={12} aria-hidden='true' />
            <span className='sr-only'>{t('Local copy unavailable')}</span>
          </span>
        )}
      </span>
      <span className='flex min-w-0 flex-col gap-1 border-t p-2'>
        <span className='line-clamp-2 text-xs break-words whitespace-normal'>
          {props.image.prompt || props.image.name}
        </span>
        <span className='text-muted-foreground truncate text-[10px]'>
          {props.image.settings.model}
        </span>
        <span className='text-muted-foreground text-[10px] tabular-nums'>
          {props.image.width} × {props.image.height}
        </span>
      </span>
    </Button>
  )
}
