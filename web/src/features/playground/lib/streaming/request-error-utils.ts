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
import { ERROR_MESSAGES } from '../../constants'

type RequestErrorLike = {
  message?: string
  response?: {
    status?: number
    data?: unknown
  }
}

export type RequestErrorDetails = {
  errorCode?: string
  errorMessage: string
}

export function parseAPIErrorDetails(
  data: unknown,
  status?: number,
  fallback?: string
): RequestErrorDetails {
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload) as unknown
    } catch {
      /* Plain text and proxy error pages are handled below. */
    }
  }
  let message = typeof payload === 'string' ? payload : undefined
  let errorCode: string | undefined
  let structuredMessage = false
  if (payload && typeof payload === 'object') {
    const record = payload as {
      error?: unknown
      message?: unknown
      code?: unknown
    }
    const error =
      record.error && typeof record.error === 'object'
        ? (record.error as { message?: unknown; code?: unknown })
        : record
    if (typeof error.code === 'string') errorCode = error.code
    if (typeof error.message === 'string') message = error.message
    else if (typeof record.error === 'string') message = record.error
    structuredMessage = Boolean(message)
  }
  message = message?.trim() || fallback?.trim()
  const html = /(?:<|&lt;)(?:!doctype\s+html|html|head|body)\b/i.test(
    message || ''
  )
  const pageStatus = html
    ? Number(
        message?.match(/<title>[^<]*\b(502|503|504)\b[^<]*<\/title>/i)?.[1]
      )
    : undefined
  const statusCode = status && status >= 400 ? status : pageStatus
  if (!errorCode && statusCode) errorCode = `http_${statusCode}`
  if (html || !structuredMessage) {
    if (statusCode === 502) {
      return { errorCode, errorMessage: ERROR_MESSAGES.BAD_GATEWAY }
    }
    if (statusCode === 503) {
      return { errorCode, errorMessage: ERROR_MESSAGES.SERVICE_UNAVAILABLE }
    }
    if (statusCode === 504) {
      return { errorCode, errorMessage: ERROR_MESSAGES.GATEWAY_TIMEOUT }
    }
  }
  if (html) return { errorCode, errorMessage: ERROR_MESSAGES.HTML_RESPONSE }
  return {
    errorCode,
    errorMessage:
      message ||
      (status === 0
        ? ERROR_MESSAGES.NETWORK_ERROR
        : ERROR_MESSAGES.API_REQUEST_ERROR),
  }
}

export function parseRequestErrorDetails(error: unknown): RequestErrorDetails {
  const requestError = error as RequestErrorLike

  return parseAPIErrorDetails(
    requestError?.response?.data,
    requestError?.response?.status,
    requestError?.message
  )
}
