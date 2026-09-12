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
  Album02Icon,
  Cancel01Icon,
  Delete02Icon,
  ImageAdd01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { skipToken, useQuery } from '@tanstack/react-query'
import { Images } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { CopyButton } from '@/components/copy-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toIntlLocale } from '@/i18n/languages'

import type { DrawingGallery as DrawingGalleryState } from '../hooks/use-drawing-gallery'
import { loadGalleryAsset } from '../lib/gallery-storage'
import type { GalleryImage, ImageAsset } from '../types'
import { GalleryImageCard } from './GalleryImageCard'
import { ImageDownloadButton } from './ImageDownloadButton'
import { ImagePreview } from './ImagePreview'

export function DrawingGallery(props: {
  gallery: DrawingGalleryState
  onClose: () => void
  onUseImage: (
    image: GalleryImage,
    asset: ImageAsset,
    asReference: boolean
  ) => boolean
}) {
  const { t, i18n } = useTranslation()
  const gallery = props.gallery
  const images = gallery.query.data?.pages.flatMap((page) => page.images) || []
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const selected =
    images.find((image) => image.id === selectedImage?.id) || selectedImage
  const preview = useQuery({
    queryKey: [
      'drawing-gallery-asset',
      selected?.userId,
      selected?.id,
      selected?.sourceUrl,
    ],
    queryFn: selected ? () => loadGalleryAsset(selected) : skipToken,
    gcTime: 0,
    retry: false,
    meta: { errorToast: false },
  })
  return (
    <section
      className='flex h-full min-h-0 flex-col'
      aria-label={t('Image gallery')}
    >
      <div className='flex shrink-0 items-center gap-2 border-b px-3 py-3'>
        <HugeiconsIcon icon={Album02Icon} size={17} aria-hidden='true' />
        <h2 className='min-w-0 flex-1 text-sm font-semibold'>{t('Gallery')}</h2>
        <span
          className='text-muted-foreground text-xs tabular-nums'
          aria-label={t('Gallery image count')}
        >
          {gallery.query.data?.pages[0]?.total ?? 0}
        </span>
        <Button
          type='button'
          variant='ghost'
          size='icon-xs'
          onClick={props.onClose}
          aria-label={t('Close gallery')}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden='true' />
        </Button>
      </div>
      <p
        className='text-muted-foreground shrink-0 px-3 py-2 text-[11px]'
        role='status'
      >
        {gallery.saving ? t('Saving…') : t('This browser only')}
      </p>
      {gallery.unsaved.length > 0 && (
        <Alert variant='destructive' className='mx-3 mb-3 w-auto shrink-0'>
          <AlertDescription>
            <p>
              {t(
                'Some images are not saved. Retry or download them from the canvas to keep a copy.'
              )}
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={gallery.saving}
              onClick={gallery.retryUnsaved}
            >
              {t('Retry saving')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <ScrollArea className='min-h-0 flex-1'>
        {gallery.query.isPending && (
          <LoadingState className='min-h-48' size='sm' />
        )}
        {gallery.query.isError && (
          <ErrorState
            title={t('The gallery could not be loaded.')}
            onRetry={() => {
              void gallery.query.refetch()
            }}
            className='min-h-48 p-4'
          />
        )}
        {gallery.query.isSuccess && images.length === 0 && (
          <EmptyState
            icon={Images}
            title={t('No images yet')}
            description={t(
              'Your generated images will appear here, even after you clear the canvas.'
            )}
            className='min-h-64 p-4'
          />
        )}
        <div className='grid grid-cols-2 items-start gap-2 px-3 pb-3'>
          {images.map((image) => (
            <GalleryImageCard
              key={image.id}
              image={image}
              onPreview={() => setSelectedImage(image)}
            />
          ))}
        </div>
        {gallery.query.hasNextPage && (
          <div className='px-3 pb-3'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-full'
              disabled={gallery.query.isFetchingNextPage}
              onClick={() => {
                void gallery.query.fetchNextPage()
              }}
            >
              {t('Load more images')}
            </Button>
          </div>
        )}
      </ScrollArea>
      {selected && (
        <ImagePreview
          image={{ ...selected, asset: preview.data, status: 'complete' }}
          onClose={() => setSelectedImage(null)}
          loading={preview.isPending}
          error={preview.isError}
          onRetry={() => {
            void preview.refetch()
          }}
          footer={
            <div className='flex w-full min-w-0 flex-col gap-3'>
              <p className='text-muted-foreground text-xs break-words'>
                {selected.settings.model} · {selected.width} × {selected.height}{' '}
                ·{' '}
                {new Date(selected.createdAt).toLocaleString(
                  toIntlLocale(i18n.resolvedLanguage || i18n.language)
                )}
              </p>
              {selected.sourceUrl && (
                <Alert>
                  <AlertDescription>
                    <p>
                      {t(
                        'This image is still hosted by the provider and may expire. Retry saving a local copy.'
                      )}
                    </p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={gallery.saving}
                      onClick={() => gallery.retryLocalCopy(selected)}
                    >
                      {t('Retry saving')}
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  size='sm'
                  disabled={!preview.data}
                  onClick={() => {
                    if (
                      preview.data &&
                      props.onUseImage(selected, preview.data, false)
                    ) {
                      setSelectedImage(null)
                    }
                  }}
                >
                  <HugeiconsIcon
                    icon={ImageAdd01Icon}
                    size={15}
                    aria-hidden='true'
                  />
                  {t('Add to canvas')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  disabled={!preview.data}
                  onClick={() => {
                    if (
                      preview.data &&
                      props.onUseImage(selected, preview.data, true)
                    ) {
                      setSelectedImage(null)
                    }
                  }}
                >
                  {t('Use as reference')}
                </Button>
                <ImageDownloadButton asset={preview.data} showLabel />
                {selected.prompt && (
                  <CopyButton
                    value={selected.prompt}
                    size='sm'
                    variant='outline'
                    aria-label={t('Copy prompt')}
                  >
                    {t('Copy prompt')}
                  </CopyButton>
                )}
                <Button
                  type='button'
                  variant='ghost'
                  size='icon-sm'
                  className='text-destructive ml-auto'
                  aria-label={t('Delete image from gallery')}
                  onClick={() => setDeleteOpen(true)}
                >
                  <HugeiconsIcon
                    icon={Delete02Icon}
                    size={16}
                    aria-hidden='true'
                  />
                </Button>
              </div>
            </div>
          }
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('Delete image from gallery?')}
        desc={t(
          'This removes the saved image from this browser. Images already on the canvas are kept.'
        )}
        confirmText={t('Delete')}
        destructive
        isLoading={gallery.removal.isPending}
        handleConfirm={() => {
          if (!selected) return
          gallery.removal.mutate(selected.id, {
            onSuccess: () => {
              setDeleteOpen(false)
              setSelectedImage(null)
            },
          })
        }}
      />
    </section>
  )
}
