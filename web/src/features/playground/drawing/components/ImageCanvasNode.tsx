/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  ArrowReloadHorizontalIcon,
  Delete02Icon,
  Download04Icon,
  ImageAdd01Icon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react'
import { memo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { useDrawingStore } from '@/stores/drawing-store'

import { downloadBlob, imageAssetToFile } from '../lib/image-assets'
import type { DrawingNode } from '../types'

export const ImageCanvasNode = memo(function ImageCanvasNode(
  props: NodeProps<DrawingNode>
) {
  const { t } = useTranslation()
  const reference = useDrawingStore((state) =>
    state.referenceIds.includes(props.id)
  )
  const checkpoint = useDrawingStore((state) => state.checkpoint)
  const [downloading, setDownloading] = useState(false)
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const asset = props.data.asset
  const imageFailed = Boolean(asset && failedSource === asset.src)
  const pending = props.data.status === 'pending'
  const complete = props.data.status === 'complete'
  return (
    <>
      <NodeResizer
        isVisible={props.selected}
        minWidth={220}
        minHeight={230}
        maxWidth={10000}
        maxHeight={10000}
        onResizeStart={checkpoint}
        lineClassName='!border-primary'
        handleClassName='!bg-primary !border-background'
      />
      <Handle
        type='target'
        position={Position.Left}
        className='!bg-muted-foreground !size-1 !border-0'
        isConnectable={false}
      />
      <Handle
        type='source'
        position={Position.Right}
        className='!bg-muted-foreground !size-1 !border-0'
        isConnectable={false}
      />
      <article
        className={cn(
          'flex size-full min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm',
          props.selected &&
            'ring-2 ring-primary ring-offset-2 ring-offset-background',
          reference && 'border-primary'
        )}
        aria-label={props.data.prompt || asset?.name || t('Image')}
      >
        <div className='drawing-node-handle flex h-9 shrink-0 cursor-grab items-center gap-2 border-b px-3 active:cursor-grabbing'>
          <span className='min-w-0 flex-1 truncate text-[11px] font-medium'>
            {props.data.settings.model || t('Uploaded image')}
          </span>
          {reference && (
            <Badge variant='secondary' className='text-[10px]'>
              {t('Reference')}
            </Badge>
          )}
          {pending && <Spinner className='size-3' />}
          {asset && complete && (
            <span className='text-muted-foreground font-mono text-[10px]'>
              {asset.width} × {asset.height}
            </span>
          )}
        </div>
        <div
          className='drawing-node-handle bg-muted/40 relative flex min-h-0 flex-1 cursor-grab items-center justify-center overflow-hidden'
          onDoubleClick={() => {
            if (asset) useDrawingStore.getState().setPreview(props.id)
          }}
        >
          {asset && !imageFailed && (
            <img
              src={asset.src}
              alt={props.data.prompt || asset.name}
              draggable={false}
              loading='lazy'
              className={cn(
                'size-full object-contain',
                pending && 'opacity-60'
              )}
              onError={() => setFailedSource(asset.src)}
            />
          )}
          {(!asset || pending || imageFailed || !complete) && (
            <div className='bg-background/75 absolute inset-0 flex flex-col items-center justify-center gap-2 p-5 text-center text-xs'>
              {pending && <Spinner className='size-5' />}
              {pending && <p role='status'>{t('Generating image…')}</p>}
              {props.data.status === 'error' && (
                <p
                  role='alert'
                  className='text-destructive max-w-full break-words'
                >
                  {t(props.data.error || 'Image generation failed.')}
                </p>
              )}
              {props.data.status === 'cancelled' && (
                <p>{t('Generation stopped')}</p>
              )}
              {imageFailed && <p>{t('The image could not be loaded.')}</p>}
            </div>
          )}
        </div>
        <div className='shrink-0 space-y-2 border-t p-3'>
          <p
            className='line-clamp-2 text-xs leading-relaxed break-words'
            title={props.data.prompt}
          >
            {props.data.prompt || asset?.name}
          </p>
          <div className='nodrag nopan flex items-center gap-1'>
            <Button
              type='button'
              size='sm'
              variant={reference ? 'secondary' : 'ghost'}
              disabled={!complete || !asset}
              aria-pressed={reference}
              className='min-w-0 flex-1 text-xs'
              onClick={() =>
                useDrawingStore.getState().toggleReference(props.id)
              }
            >
              <HugeiconsIcon
                icon={ImageAdd01Icon}
                size={14}
                aria-hidden='true'
              />
              {reference ? t('Reference selected') : t('Use as reference')}
            </Button>
            <Button
              type='button'
              size='icon-xs'
              variant='ghost'
              disabled={!asset}
              title={t('Preview')}
              aria-label={t('Preview')}
              onClick={() => useDrawingStore.getState().setPreview(props.id)}
            >
              <HugeiconsIcon icon={ViewIcon} size={14} aria-hidden='true' />
            </Button>
            <Button
              type='button'
              size='icon-xs'
              variant='ghost'
              disabled={!asset || !complete || downloading}
              title={t('Download')}
              aria-label={t('Download')}
              onClick={async () => {
                if (!asset) return
                setDownloading(true)
                try {
                  const file = await imageAssetToFile(asset)
                  downloadBlob(
                    file,
                    `new-api-${props.id}.${file.type.split('/')[1]}`
                  )
                } catch {
                  toast.error(
                    t(
                      'The image could not be downloaded. Try opening the preview.'
                    )
                  )
                } finally {
                  setDownloading(false)
                }
              }}
            >
              <HugeiconsIcon
                icon={Download04Icon}
                size={14}
                aria-hidden='true'
              />
            </Button>
            <Button
              type='button'
              size='icon-xs'
              variant='ghost'
              title={t('Reuse prompt and settings')}
              aria-label={t('Reuse prompt and settings')}
              onClick={() => {
                const state = useDrawingStore.getState()
                state.updateSettings({
                  ...props.data.settings,
                  prompt: props.data.prompt,
                })
                state.setReferences(
                  (props.data.referenceIds || []).filter((id) =>
                    state.nodes.some((node) => node.id === id)
                  )
                )
              }}
            >
              <HugeiconsIcon
                icon={ArrowReloadHorizontalIcon}
                size={14}
                aria-hidden='true'
              />
            </Button>
            <Button
              type='button'
              size='icon-xs'
              variant='ghost'
              title={t('Delete')}
              aria-label={t('Delete')}
              onClick={() => useDrawingStore.getState().removeNodes([props.id])}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} aria-hidden='true' />
            </Button>
          </div>
        </div>
      </article>
    </>
  )
})
