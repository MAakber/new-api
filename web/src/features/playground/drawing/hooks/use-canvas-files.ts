import { useReactFlow } from '@xyflow/react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { useDrawingStore } from '@/stores/drawing-store'

import {
  parseDrawingDocument,
  serializeDrawingDocument,
} from '../lib/canvas-document'
import { downloadBlob, imageFileToAsset } from '../lib/image-assets'
import type {
  DrawingDocument,
  DrawingNode,
  ImageAsset,
  ImageNodeData,
} from '../types'

export function useCanvasFiles() {
  const { t } = useTranslation()
  const flow = useReactFlow<DrawingNode>()
  const [busy, setBusy] = useState(false)
  const [pendingImport, setPendingImport] = useState<DrawingDocument | null>(
    null
  )

  const addAssets = (
    assets: ImageAsset[],
    position: { x: number; y: number },
    asReferences = false,
    details?: Pick<ImageNodeData, 'prompt' | 'settings' | 'revisedPrompt'>
  ): boolean => {
    const state = useDrawingStore.getState()
    const existing = assets.flatMap((asset) => {
      const node = state.nodes.find(
        (item) =>
          item.data.asset?.id === asset.id && item.data.status === 'complete'
      )
      return node ? [node] : []
    })
    const newAssets = assets.filter(
      (asset) => !existing.some((node) => node.data.asset?.id === asset.id)
    )
    if (state.nodes.length + newAssets.length > 500) {
      toast.error(
        t(
          'This canvas can hold up to 500 images. Export it before starting a new one.'
        )
      )
      return false
    }
    if (
      asReferences &&
      state.referenceIds.length +
        assets.length -
        existing.filter((node) => state.referenceIds.includes(node.id)).length >
        16
    ) {
      toast.error(
        t('Use one reference for DALL·E 2 or up to 16 for GPT Image.')
      )
      return false
    }
    const nodes: DrawingNode[] = newAssets.map((asset, index) => ({
      id: crypto.randomUUID(),
      type: 'image',
      dragHandle: '.drawing-node-handle',
      position: {
        x: position.x + (index % 3) * 312,
        y: position.y + Math.floor(index / 3) * 370,
      },
      width: 280,
      height: 330,
      selected: true,
      data: {
        asset,
        origin: details ? 'gallery' : 'uploaded',
        prompt: details?.prompt || '',
        settings: { ...(details?.settings || state.settings) },
        revisedPrompt: details?.revisedPrompt,
        status: 'complete',
        createdAt: Date.now(),
      },
    }))
    if (nodes.length) state.addNodes(nodes)
    const targets = [...existing, ...nodes]
    const ids = new Set(targets.map((node) => node.id))
    state.changeNodes(
      useDrawingStore.getState().nodes.map((node) => ({
        type: 'select',
        id: node.id,
        selected: ids.has(node.id),
      }))
    )
    if (asReferences) {
      state.setReferences([...state.referenceIds, ...ids])
      state.updateSettings({ mode: 'edit' })
    }
    requestAnimationFrame(() => {
      void flow.fitView({ nodes: targets, padding: 0.3, maxZoom: 1 })
    })
    return true
  }

  const addImages = async (
    files: File[],
    position: { x: number; y: number },
    asReferences = false
  ) => {
    if (!files.length) return
    const userId = useDrawingStore.getState().userId
    if (useDrawingStore.getState().nodes.length + files.length > 500) {
      toast.error(
        t(
          'This canvas can hold up to 500 images. Export it before starting a new one.'
        )
      )
      return
    }
    setBusy(true)
    try {
      const assets: ImageAsset[] = []
      for (const file of files) assets.push(await imageFileToAsset(file))
      if (useDrawingStore.getState().userId !== userId) return
      addAssets(assets, position, asReferences)
    } catch (error) {
      toast.error(
        t(
          error instanceof Error
            ? error.message
            : 'The image could not be loaded.'
        )
      )
    } finally {
      setBusy(false)
    }
  }

  const importCanvas = async (file: File) => {
    setBusy(true)
    try {
      if (file.size > 200 * 1024 * 1024) {
        throw new Error('Canvas files must be smaller than 200 MB.')
      }
      const document = parseDrawingDocument(JSON.parse(await file.text()))
      setPendingImport(document)
    } catch (error) {
      toast.error(
        t(
          error instanceof Error && !(error instanceof SyntaxError)
            ? error.message
            : 'This file is not a valid drawing canvas.'
        )
      )
    } finally {
      setBusy(false)
    }
  }

  const exportCanvas = () => {
    try {
      const document = serializeDrawingDocument(useDrawingStore.getState())
      downloadBlob(
        new Blob([JSON.stringify(document)], { type: 'application/json' }),
        `new-api-canvas-${new Date().toISOString().slice(0, 10)}.json`
      )
    } catch {
      toast.error(t('The canvas could not be exported.'))
    }
  }
  return {
    addImages,
    addAssets,
    importCanvas,
    exportCanvas,
    busy,
    pendingImport,
    setPendingImport,
  }
}
