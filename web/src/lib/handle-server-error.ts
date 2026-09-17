import { toast } from 'sonner'

import {
  getServerErrorMessage,
  getServerErrorSources,
  isServerErrorCancelled,
} from './server-error-message'

const reportedErrors = new WeakSet<object>()

/** Also used when a failure has already been presented inline. */
export function markServerErrorHandled(error: unknown): void {
  for (const source of getServerErrorSources(error)) reportedErrors.add(source)
}

export function handleServerError(
  error: unknown,
  fallbackMessage?: string,
  presentation?: { title: string; description?: string }
): void {
  if (isServerErrorCancelled(error)) return
  const sources = getServerErrorSources(error)
  const reported = sources.some((source) => reportedErrors.has(source))
  markServerErrorHandled(error)
  if (reported) return
  const message =
    presentation?.title || getServerErrorMessage(error, fallbackMessage)
  if (presentation?.description) {
    toast.error(message, { description: presentation.description })
  } else {
    toast.error(message)
  }
}
