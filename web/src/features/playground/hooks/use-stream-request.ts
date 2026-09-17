import { useCallback, useEffect, useRef, useState } from 'react'
import { SSE } from 'sse.js'

import { getFreshAuthHeaders } from '@/lib/api'

import { API_ENDPOINTS, ERROR_MESSAGES } from '../constants'
import {
  getStreamReadyStateError,
  isStreamDoneMessage,
  parseStreamErrorDetails,
  parseStreamMessageUpdates,
} from '../lib'
import {
  StreamResponseError,
  type StreamMessageUpdate,
} from '../lib/streaming/stream-utils'
import type { ChatCompletionRequest } from '../types'

interface StreamEventSource {
  readyState?: number
  addEventListener: (
    type: string,
    listener: (
      event: Event & {
        data?: string
        readyState?: number
        responseCode?: number
        headers?: Record<string, string[]>
      }
    ) => void
  ) => void
  close: () => void
  stream: () => void
}

interface StreamRequestCallbacks {
  onUpdate: (update: StreamMessageUpdate) => void
  onComplete: () => void
  onError: (error: string, errorCode?: string) => void
}

interface StreamRequestControllerRuntime {
  getHeaders: () => Promise<Record<string, string>>
  createSource: (
    payload: ChatCompletionRequest,
    headers: Record<string, string>
  ) => StreamEventSource
  setStreaming: (streaming: boolean) => void
}

export function createStreamRequestController(
  runtime: StreamRequestControllerRuntime
) {
  let source: StreamEventSource | null = null
  let generation = 0

  const closeActiveSource = (target: StreamEventSource) => {
    target.close()
    if (source === target) {
      source = null
      runtime.setStreaming(false)
    }
  }

  const send = async (
    payload: ChatCompletionRequest,
    callbacks: StreamRequestCallbacks
  ) => {
    const requestGeneration = generation + 1
    generation = requestGeneration
    const previousSource = source
    source = null
    previousSource?.close()
    runtime.setStreaming(false)

    let headers: Record<string, string>
    try {
      headers = await runtime.getHeaders()
    } catch (error: unknown) {
      if (generation !== requestGeneration) return
      callbacks.onError(
        error instanceof Error
          ? error.message
          : ERROR_MESSAGES.STREAM_START_ERROR
      )
      return
    }
    if (generation !== requestGeneration) return

    const nextSource = runtime.createSource(payload, headers)
    source = nextSource
    runtime.setStreaming(true)
    let completed = false
    let responseCode: number | undefined

    const isCurrent = () =>
      generation === requestGeneration && source === nextSource

    const handleError = (errorMessage: string, errorCode?: string) => {
      if (!isCurrent() || completed) return
      completed = true
      callbacks.onError(errorMessage, errorCode)
      closeActiveSource(nextSource)
    }

    nextSource.addEventListener('open', (event) => {
      if (!isCurrent() || completed) return
      responseCode = event.responseCode
      if (
        event.headers?.['content-type']?.some((value) =>
          value.includes('text/html')
        )
      ) {
        const details = parseStreamErrorDetails('<html>', responseCode)
        handleError(details.errorMessage, details.errorCode)
      }
    })

    nextSource.addEventListener('message', (event) => {
      if (!isCurrent() || completed) return
      const data = event.data ?? ''
      if (isStreamDoneMessage(data)) {
        completed = true
        closeActiveSource(nextSource)
        callbacks.onComplete()
        return
      }

      try {
        const updates = parseStreamMessageUpdates(data)

        for (const update of updates) {
          callbacks.onUpdate(update)
        }
      } catch (error) {
        if (error instanceof StreamResponseError) {
          handleError(error.message, error.errorCode)
          return
        }
        // eslint-disable-next-line no-console
        console.error('Failed to parse SSE message:', error)
        handleError(ERROR_MESSAGES.PARSE_ERROR)
      }
    })

    nextSource.addEventListener('error', (event) => {
      if (!isCurrent() || completed) return
      const details = parseStreamErrorDetails(
        event.data,
        event.responseCode ?? responseCode
      )
      handleError(details.errorMessage, details.errorCode)
    })

    nextSource.addEventListener('readystatechange', (event) => {
      if (!isCurrent() || completed) return
      const errorMessage = getStreamReadyStateError(
        event.readyState,
        responseCode
      )

      if (errorMessage) {
        handleError(
          errorMessage,
          responseCode && responseCode >= 400
            ? `http_${responseCode}`
            : undefined
        )
      }
    })

    try {
      if (!isCurrent()) return
      nextSource.stream()
    } catch (error: unknown) {
      if (!isCurrent() || completed) return
      // eslint-disable-next-line no-console
      console.error('Failed to start SSE stream:', error)
      handleError(ERROR_MESSAGES.STREAM_START_ERROR)
    }
  }

  const cancel = (notify: boolean) => {
    generation += 1
    const activeSource = source
    source = null
    activeSource?.close()
    if (notify) runtime.setStreaming(false)
  }

  const stop = () => cancel(true)
  const dispose = () => cancel(false)

  return { send, stop, dispose }
}

/**
 * Hook for handling streaming chat completion requests
 */
export function useStreamRequest() {
  const [isStreaming, setIsStreaming] = useState(false)
  const controllerRef = useRef<ReturnType<
    typeof createStreamRequestController
  > | null>(null)
  if (!controllerRef.current) {
    controllerRef.current = createStreamRequestController({
      getHeaders: getFreshAuthHeaders,
      createSource: (payload, headers) =>
        new SSE(API_ENDPOINTS.CHAT_COMPLETIONS, {
          headers,
          method: 'POST',
          payload: JSON.stringify(payload),
          start: false,
        }) as StreamEventSource,
      setStreaming: setIsStreaming,
    })
  }

  const sendStreamRequest = useCallback(
    (
      payload: ChatCompletionRequest,
      onUpdate: (update: StreamMessageUpdate) => void,
      onComplete: () => void,
      onError: (error: string, errorCode?: string) => void
    ) =>
      controllerRef.current?.send(payload, {
        onUpdate,
        onComplete,
        onError,
      }),
    []
  )

  const stopStream = useCallback(() => {
    controllerRef.current?.stop()
  }, [])

  useEffect(
    () => () => {
      controllerRef.current?.dispose()
    },
    []
  )

  return {
    sendStreamRequest,
    stopStream,
    isStreaming,
  }
}
