import { useEffect, useState } from 'react'

import { useDrawingStore } from '@/stores/drawing-store'

import { loadDrawingDocument, saveDrawingDocument } from '../lib/canvas-storage'

export function useDrawingPersistence(
  userId: number
): 'loading' | 'saving' | 'saved' | 'error' {
  const [status, setStatus] = useState<
    'loading' | 'saving' | 'saved' | 'error'
  >('loading')
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let savedRevision = 0
    let queue = Promise.resolve()
    useDrawingStore.getState().initialize(userId)
    setStatus('loading')

    const save = () => {
      const state = useDrawingStore.getState()
      if (
        !state.ready ||
        state.userId !== userId ||
        state.revision === savedRevision
      ) {
        return
      }
      const revision = state.revision
      savedRevision = revision
      if (active) setStatus('saving')
      queue = queue
        .then(() => saveDrawingDocument(userId, state))
        .then(() => {
          if (active && useDrawingStore.getState().revision === revision) {
            setStatus('saved')
          }
        })
        .catch(() => {
          savedRevision = -1
          if (active) setStatus('error')
        })
    }

    void loadDrawingDocument(userId)
      .then((document) => {
        if (!active) return
        useDrawingStore.getState().hydrate(document)
        setStatus('saved')
      })
      .catch(() => {
        if (!active) return
        useDrawingStore.getState().hydrate(null)
        setStatus('error')
      })

    const unsubscribe = useDrawingStore.subscribe((state, previous) => {
      if (
        state.userId !== userId ||
        !state.ready ||
        state.revision === previous.revision
      ) {
        return
      }
      setStatus('saving')
      if (timer) clearTimeout(timer)
      timer = setTimeout(save, 500)
    })
    const flush = () => {
      if (timer) clearTimeout(timer)
      save()
    }
    window.addEventListener('pagehide', flush)
    return () => {
      flush()
      active = false
      unsubscribe()
      window.removeEventListener('pagehide', flush)
    }
  }, [userId])
  return status
}
