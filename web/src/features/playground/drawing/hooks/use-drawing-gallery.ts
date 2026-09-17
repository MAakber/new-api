import {
  useInfiniteQuery,
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useDrawingStore } from '@/stores/drawing-store'

import {
  deleteGalleryImage,
  loadGalleryPage,
  saveGalleryImage,
} from '../lib/gallery-storage'
import type { GalleryCursor, GalleryImage, ImageNodeData } from '../types'

export function useDrawingGallery(userId: number, ready: boolean) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [unsaved, setUnsaved] = useState<ImageNodeData[]>([])
  const query = useInfiniteQuery({
    queryKey: ['drawing-gallery', userId],
    initialPageParam: undefined as GalleryCursor | undefined,
    queryFn: ({ pageParam }) => loadGalleryPage(userId, pageParam),
    getNextPageParam: (page) => page.nextCursor,
    enabled: ready,
    refetchOnWindowFocus: 'always',
    meta: { errorToast: false },
    retry: false,
  })
  const { mutate: save, mutateAsync: saveAsync } = useMutation({
    mutationKey: ['drawing-gallery-save', userId],
    mutationFn: (input: { data: ImageNodeData; retry?: boolean }) =>
      saveGalleryImage(userId, input.data, input.retry),
    onSuccess: (_image, input) => {
      setUnsaved((current) =>
        current.filter((item) => item.asset?.id !== input.data.asset?.id)
      )
      return client.invalidateQueries({ queryKey: ['drawing-gallery', userId] })
    },
    onError: (_error, input) => {
      setUnsaved((current) => [
        ...current.filter((item) => item.asset?.id !== input.data.asset?.id),
        input.data,
      ])
      toast.error(t('The image could not be saved to the gallery.'), {
        id: 'drawing-gallery-save',
      })
    },
  })
  const saving =
    useIsMutating({ mutationKey: ['drawing-gallery-save', userId] }) > 0
  const archive = useCallback(
    (ownerId: number, data: ImageNodeData) => {
      if (ownerId === userId) save({ data })
    },
    [save, userId]
  )

  useEffect(() => {
    if (!ready) return
    const state = useDrawingStore.getState()
    if (state.userId !== userId) return
    let active = true
    const backfill = async () => {
      for (const node of state.nodes) {
        if (!active) break
        const data = node.data
        // Old canvases did not record provenance; uploads had an empty prompt.
        const generated =
          data.origin === 'generated' || (!data.origin && data.prompt.trim())
        if (!generated || data.status !== 'complete' || !data.asset) continue
        await saveAsync({ data }).catch(() => undefined)
      }
    }
    void backfill()
    return () => {
      active = false
    }
  }, [ready, saveAsync, userId])

  const removal = useMutation({
    mutationFn: (id: string) => deleteGalleryImage(userId, id),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['drawing-gallery', userId] }),
    onError: () => toast.error(t('The image could not be deleted.')),
  })

  return {
    query,
    archive,
    saving,
    unsaved,
    removal,
    retryUnsaved: () => {
      for (const data of unsaved) save({ data, retry: true })
    },
    retryLocalCopy: (image: GalleryImage) => {
      if (!image.sourceUrl) return
      save({
        retry: true,
        data: {
          ...image,
          asset: { ...image, src: image.sourceUrl },
          status: 'complete',
        },
      })
    },
  }
}

export type DrawingGallery = ReturnType<typeof useDrawingGallery>
