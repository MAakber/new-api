import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { useDrawingStore } from '@/stores/drawing-store'

import type { ImageNodeData } from '../types'

export function ImagePreview(props: {
  image?: ImageNodeData | null
  onClose?: () => void
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  footer?: ReactNode
}) {
  const { t } = useTranslation()
  const id = useDrawingStore((state) => state.previewId)
  const node = useDrawingStore((state) =>
    state.nodes.find((item) => item.id === state.previewId)
  )
  const setPreview = useDrawingStore((state) => state.setPreview)
  const data = props.image === undefined ? node?.data : props.image
  if (!data || (props.image === undefined && (!id || !data.asset))) return null
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (props.onClose) props.onClose()
          else setPreview(null)
        }
      }}
      title={t('Image preview')}
      description={
        <span
          role='region'
          aria-label={data.prompt ? t('Prompt') : t('Image')}
          tabIndex={0}
          className='block max-h-24 overflow-y-auto break-words whitespace-pre-wrap'
        >
          {data.prompt || data.asset?.name}
        </span>
      }
      contentClassName='sm:max-w-5xl'
      footer={props.footer}
    >
      {props.loading && <LoadingState />}
      {props.error && (
        <ErrorState
          title={t('The image could not be loaded.')}
          onRetry={props.onRetry}
        />
      )}
      {data.asset && (
        <img
          src={data.asset.src}
          alt={data.prompt || data.asset.name}
          className='max-h-[60svh] w-full rounded-lg object-contain'
        />
      )}
      {data.revisedPrompt && (
        <div className='mt-4 space-y-1 text-sm'>
          <p className='font-medium'>{t('Revised prompt')}</p>
          <p className='text-muted-foreground break-words whitespace-pre-wrap'>
            {data.revisedPrompt}
          </p>
        </div>
      )}
    </Dialog>
  )
}
