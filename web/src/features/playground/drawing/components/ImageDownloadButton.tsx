import { Download04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

import { downloadBlob, imageAssetToFile } from '../lib/image-assets'
import type { ImageAsset } from '../types'

export function ImageDownloadButton(props: {
  asset?: ImageAsset
  disabled?: boolean
  showLabel?: boolean
  filenameId?: string
}) {
  const { t } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  return (
    <Button
      type='button'
      size={props.showLabel ? 'sm' : 'icon-xs'}
      variant={props.showLabel ? 'outline' : 'ghost'}
      disabled={!props.asset || props.disabled || downloading}
      title={t('Download')}
      aria-label={t('Download')}
      onClick={async () => {
        if (!props.asset) return
        setDownloading(true)
        try {
          const file = await imageAssetToFile(props.asset)
          downloadBlob(
            file,
            `new-api-${props.filenameId ?? props.asset.id}.${file.type.split('/')[1]}`
          )
        } catch {
          toast.error(
            t('The image could not be downloaded. Try opening the preview.')
          )
        } finally {
          setDownloading(false)
        }
      }}
    >
      <HugeiconsIcon icon={Download04Icon} size={14} aria-hidden='true' />
      {props.showLabel && t('Download')}
    </Button>
  )
}
