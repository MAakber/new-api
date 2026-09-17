import axios from 'axios'

import {
  getServerErrorMessageKey,
  safeServerErrorMessage,
} from './server-error-message'

export class AuthOperationError extends Error {
  readonly [safeServerErrorMessage] = true
  constructor(
    message: string,
    readonly code?: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'AuthOperationError'
  }

  static from(
    error: unknown,
    fallback = 'Verification failed. Please try again.'
  ): AuthOperationError {
    if (error instanceof AuthOperationError) return error
    if (axios.isAxiosError<{ message?: string; code?: string }>(error)) {
      return new AuthOperationError(
        getServerErrorMessageKey(error) ||
          (error.response && error.response.status >= 500
            ? 'Please try again later.'
            : undefined) ||
          error.response?.data?.message ||
          error.message ||
          fallback,
        error.response?.data?.code,
        { cause: error }
      )
    }
    return new AuthOperationError(
      error instanceof Error ? error.message : fallback,
      undefined,
      { cause: error }
    )
  }
}

export const authRequestOptions = {
  skipBusinessError: true,
  skipErrorHandler: true,
}

export async function authResult<T>(
  request: Promise<{
    data: { success: boolean; message?: string; code?: string; data?: T }
  }>,
  fallback = 'Verification failed. Please try again.'
): Promise<T> {
  try {
    const { data: response } = await request
    if (!response.success || response.data === undefined) {
      throw new AuthOperationError(
        getServerErrorMessageKey(response) || response.message || fallback,
        response.code
      )
    }
    return response.data
  } catch (error) {
    throw AuthOperationError.from(error, fallback)
  }
}
