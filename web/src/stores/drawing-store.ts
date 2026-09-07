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
  applyNodeChanges,
  type NodeChange,
  type Edge,
  type Viewport,
} from '@xyflow/react'
import { create } from 'zustand'

import { arrangeImageNodes } from '@/features/playground/drawing/lib/canvas-document'
import { DEFAULT_IMAGE_SETTINGS } from '@/features/playground/drawing/lib/image-settings'
import type {
  DrawingDocument,
  DrawingMask,
  DrawingNode,
  ImageNodeData,
  ImageSettings,
} from '@/features/playground/drawing/types'

type CanvasSnapshot = Pick<
  DrawingDocument,
  'nodes' | 'edges' | 'referenceIds' | 'mask'
>
type DrawingState = DrawingDocument & {
  userId: number | null
  ready: boolean
  revision: number
  past: CanvasSnapshot[]
  future: CanvasSnapshot[]
  previewId: string | null
  initialize: (userId: number, document?: DrawingDocument) => void
  hydrate: (document: DrawingDocument | null) => void
  checkpoint: () => void
  changeNodes: (changes: NodeChange<DrawingNode>[]) => void
  addNodes: (nodes: DrawingNode[], edges?: Edge[]) => void
  removeNodes: (ids: string[]) => void
  updateNodeData: (id: string, data: Partial<ImageNodeData>) => void
  updateSettings: (settings: Partial<ImageSettings>) => void
  setViewport: (viewport: Viewport) => void
  toggleReference: (id: string) => void
  setReferences: (ids: string[]) => void
  setMask: (mask: DrawingMask | null) => void
  setPreview: (id: string | null) => void
  undo: () => void
  redo: () => void
  arrange: () => void
  clear: () => void
  replaceDocument: (document: DrawingDocument) => void
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  version: 1,
  nodes: [],
  edges: [],
  viewport: { x: 40, y: 40, zoom: 1 },
  settings: DEFAULT_IMAGE_SETTINGS,
  userId: null,
  ready: false,
  revision: 0,
  past: [],
  future: [],
  referenceIds: [],
  mask: null,
  previewId: null,

  initialize: (userId, document) =>
    set({
      userId,
      ready: Boolean(document),
      revision: 0,
      past: [],
      future: [],
      previewId: null,
      referenceIds: document?.referenceIds || [],
      mask: document?.mask || null,
      nodes: document?.nodes || [],
      edges: document?.edges || [],
      viewport: document?.viewport || { x: 40, y: 40, zoom: 1 },
      settings: document?.settings || { ...DEFAULT_IMAGE_SETTINGS },
    }),
  hydrate: (document) =>
    set({
      ready: true,
      ...(document
        ? {
            nodes: document.nodes,
            edges: document.edges,
            viewport: document.viewport,
            settings: document.settings,
            referenceIds: document.referenceIds,
            mask: document.mask,
          }
        : {}),
    }),
  checkpoint: () =>
    set((state) => ({
      past: [
        ...state.past.slice(-29),
        {
          nodes: state.nodes,
          edges: state.edges,
          referenceIds: state.referenceIds,
          mask: state.mask,
        },
      ],
      future: [],
    })),
  changeNodes: (changes) => {
    const edited = changes.some(
      (change) =>
        change.type === 'remove' ||
        (change.type === 'position' && change.dragging === undefined)
    )
    if (edited) get().checkpoint()
    set((state) => {
      const nodes = applyNodeChanges(changes, state.nodes)
      const ids = new Set(nodes.map((node) => node.id))
      return {
        nodes,
        edges: state.edges.filter(
          (edge) => ids.has(edge.source) && ids.has(edge.target)
        ),
        referenceIds: state.referenceIds.filter((id) => ids.has(id)),
        mask: state.mask && ids.has(state.mask.referenceId) ? state.mask : null,
        revision:
          state.revision +
          (changes.some((change) => change.type !== 'select') ? 1 : 0),
      }
    })
  },
  addNodes: (nodes, edges = []) => {
    get().checkpoint()
    set((state) => ({
      nodes: [
        ...state.nodes.map((node) => ({ ...node, selected: false })),
        ...nodes,
      ],
      edges: [...state.edges, ...edges],
      revision: state.revision + 1,
    }))
  },
  removeNodes: (ids) => {
    get().checkpoint()
    const removed = new Set(ids)
    set((state) => ({
      nodes: state.nodes.filter((node) => !removed.has(node.id)),
      edges: state.edges.filter(
        (edge) => !removed.has(edge.source) && !removed.has(edge.target)
      ),
      referenceIds: state.referenceIds.filter((id) => !removed.has(id)),
      mask:
        state.mask && !removed.has(state.mask.referenceId) ? state.mask : null,
      revision: state.revision + 1,
    }))
  },
  updateNodeData: (id, data) =>
    set((state) => {
      // Keep undo/redo snapshots in sync with asynchronous generation results.
      // Undoing a move must never turn a completed image back into a pending job.
      const update = (nodes: DrawingNode[]) =>
        nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...data } } : node
        )
      return {
        nodes: update(state.nodes),
        past: state.past.map((snapshot) => ({
          ...snapshot,
          nodes: update(snapshot.nodes),
        })),
        future: state.future.map((snapshot) => ({
          ...snapshot,
          nodes: update(snapshot.nodes),
        })),
        revision: state.revision + 1,
      }
    }),
  updateSettings: (settings) =>
    set((state) => ({
      settings: { ...state.settings, ...settings },
      revision: state.revision + 1,
    })),
  setViewport: (viewport) =>
    set((state) => ({ viewport, revision: state.revision + 1 })),
  toggleReference: (id) =>
    set((state) => {
      if (state.referenceIds.includes(id)) {
        return {
          referenceIds: state.referenceIds.filter((value) => value !== id),
          mask: state.mask?.referenceId === id ? null : state.mask,
          revision: state.revision + 1,
        }
      }
      if (
        state.referenceIds.length >= 16 ||
        !state.nodes.some(
          (node) =>
            node.id === id && node.data.asset && node.data.status === 'complete'
        )
      ) {
        return state
      }
      return {
        referenceIds: [...state.referenceIds, id],
        settings: { ...state.settings, mode: 'edit' },
        revision: state.revision + 1,
      }
    }),
  setReferences: (ids) =>
    set((state) => {
      const referenceIds = [...new Set(ids)]
        .filter((id) =>
          state.nodes.some(
            (node) =>
              node.id === id &&
              node.data.status === 'complete' &&
              node.data.asset
          )
        )
        .slice(0, 16)
      return {
        referenceIds,
        mask: state.mask?.referenceId === referenceIds[0] ? state.mask : null,
        revision: state.revision + 1,
      }
    }),
  setMask: (mask) => set((state) => ({ mask, revision: state.revision + 1 })),
  setPreview: (previewId) => set({ previewId }),
  undo: () =>
    set((state) => {
      const snapshot = state.past.at(-1)
      if (!snapshot) return state
      return {
        ...snapshot,
        past: state.past.slice(0, -1),
        future: [
          {
            nodes: state.nodes,
            edges: state.edges,
            referenceIds: state.referenceIds,
            mask: state.mask,
          },
          ...state.future,
        ],
        revision: state.revision + 1,
      }
    }),
  redo: () =>
    set((state) => {
      const snapshot = state.future[0]
      if (!snapshot) return state
      return {
        ...snapshot,
        future: state.future.slice(1),
        past: [
          ...state.past,
          {
            nodes: state.nodes,
            edges: state.edges,
            referenceIds: state.referenceIds,
            mask: state.mask,
          },
        ],
        revision: state.revision + 1,
      }
    }),
  arrange: () => {
    get().checkpoint()
    set((state) => ({
      nodes: arrangeImageNodes(state.nodes),
      revision: state.revision + 1,
    }))
  },
  clear: () => {
    get().checkpoint()
    set((state) => ({
      nodes: [],
      edges: [],
      referenceIds: [],
      mask: null,
      revision: state.revision + 1,
    }))
  },
  replaceDocument: (document) => {
    get().checkpoint()
    set((state) => ({
      ...document,
      previewId: null,
      revision: state.revision + 1,
    }))
  },
}))
