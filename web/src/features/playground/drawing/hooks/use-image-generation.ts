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
import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useDrawingStore } from '@/stores/drawing-store'

import { generateImages } from '../api'
import { imageSourceToAsset } from '../lib/image-assets'
import { validateImageSettings } from '../lib/image-settings'
import type { DrawingNode, ImageAsset, ImageSettings } from '../types'

type ImageJob = { id: string; controller: AbortController; nodeIds: string[] }
type GenerationInput = {
  job: ImageJob
  settings: ImageSettings
  references: ImageAsset[]
  mask?: ImageAsset
  userId: number | null
}

export function useImageGeneration() {
  const { t } = useTranslation()
  const jobs = useRef(new Map<string, ImageJob>())
  const [pendingCount, setPendingCount] = useState(0)

  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: GenerationInput) => {
      const result = await generateImages({
        settings: input.settings,
        references: input.references,
        mask: input.mask,
        signal: input.job.controller.signal,
        onPartial: (image, index) => {
          const state = useDrawingStore.getState()
          const id = input.job.nodeIds[index]
          if (
            state.userId !== input.userId ||
            input.job.controller.signal.aborted ||
            !id
          ) {
            return
          }
          // A preview uses the target dimensions; final decoding resolves the actual size.
          state.updateNodeData(id, {
            asset: {
              id,
              src: image.src,
              mimeType: image.mimeType,
              name: input.settings.prompt.slice(0, 512),
              width: 1024,
              height: 1024,
            },
          })
        },
      })
      const assets = await Promise.allSettled(
        result.images.map((image, index) =>
          imageSourceToAsset(
            image.src,
            `${input.settings.model}-${index + 1}`,
            image.mimeType,
            input.job.controller.signal
          )
        )
      )
      if (useDrawingStore.getState().userId !== input.userId) return
      input.job.controller.signal.throwIfAborted()
      for (const [index, id] of input.job.nodeIds.entries()) {
        const asset = assets[index]
        if (!asset) {
          useDrawingStore.getState().updateNodeData(id, {
            status: 'error',
            error: 'The server returned fewer images than requested.',
          })
          continue
        }
        if (asset.status === 'rejected') {
          const error =
            asset.reason instanceof Error
              ? asset.reason.message.slice(0, 10000)
              : 'The image could not be loaded.'
          useDrawingStore
            .getState()
            .updateNodeData(id, { status: 'error', error })
          continue
        }
        useDrawingStore.getState().updateNodeData(id, {
          asset: asset.value,
          status: 'complete',
          revisedPrompt: result.images[index].revisedPrompt?.slice(0, 64000),
          usage: result.usage,
        })
      }
    },
    onError: (error, input) => {
      if (useDrawingStore.getState().userId !== input.userId) return
      const cancelled = input.job.controller.signal.aborted
      const message =
        error instanceof Error
          ? error.message.slice(0, 10000)
          : 'Image generation failed.'
      for (const id of input.job.nodeIds) {
        useDrawingStore.getState().updateNodeData(id, {
          status: cancelled ? 'cancelled' : 'error',
          error: cancelled ? undefined : message,
        })
      }
      if (!cancelled) toast.error(t(message))
    },
    onSettled: (_data, _error, input) => {
      jobs.current.delete(input.job.id)
      setPendingCount(jobs.current.size)
    },
  })

  useEffect(() => {
    const activeJobs = jobs.current
    return () => {
      for (const job of activeJobs.values()) job.controller.abort()
      activeJobs.clear()
    }
  }, [])

  const generate = (
    settings: ImageSettings,
    position: { x: number; y: number },
    mask?: ImageAsset
  ) => {
    const state = useDrawingStore.getState()
    const referenceNodes = state.referenceIds.flatMap((id) => {
      const node = state.nodes.find(
        (item) => item.id === id && item.data.status === 'complete'
      )
      return node?.data.asset ? [node] : []
    })
    const references = referenceNodes.flatMap((node) =>
      node.data.asset ? [node.data.asset] : []
    )
    const error = validateImageSettings(settings, references.length)
    if (error) {
      toast.error(t(error))
      return false
    }
    if (state.nodes.length + settings.n > 500) {
      toast.error(
        t(
          'This canvas can hold up to 500 images. Export it before starting a new one.'
        )
      )
      return false
    }
    const job: ImageJob = {
      id: crypto.randomUUID(),
      controller: new AbortController(),
      nodeIds: [],
    }
    const nodes: DrawingNode[] = Array.from(
      { length: settings.n },
      (_, index) => ({
        id: crypto.randomUUID(),
        type: 'image',
        dragHandle: '.drawing-node-handle',
        position: {
          x: position.x + (index % 3) * 312,
          y: position.y + Math.floor(index / 3) * 370,
        },
        width: 280,
        height: 330,
        data: {
          prompt: settings.prompt,
          settings: { ...settings },
          status: 'pending',
          jobId: job.id,
          createdAt: Date.now(),
          referenceIds:
            settings.mode === 'edit'
              ? referenceNodes.map((node) => node.id)
              : [],
        },
      })
    )
    job.nodeIds = nodes.map((node) => node.id)
    const edges =
      settings.mode === 'edit'
        ? referenceNodes.flatMap((source) =>
            nodes.map((target) => ({
              id: `${source.id}-${target.id}`,
              source: source.id,
              target: target.id,
            }))
          )
        : []
    state.addNodes(nodes, edges)
    jobs.current.set(job.id, job)
    setPendingCount(jobs.current.size)
    mutation.mutate({ job, settings, references, mask, userId: state.userId })
    return true
  }
  const cancel = (jobId?: string) => {
    for (const job of jobs.current.values()) {
      if (!jobId || job.id === jobId) job.controller.abort()
    }
  }
  return { generate, cancel, pendingCount }
}
