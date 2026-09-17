import { useState, useEffect, useCallback } from 'react'

import type { TwoFAStatus } from '@/features/profile/types'
import { AuthOperationError } from '@/lib/secure-verification'

import { get2FAStatus } from '../api'

// ============================================================================
// Two-FA Hook
// ============================================================================

const DEFAULT_STATUS: TwoFAStatus = {
  enabled: false,
  locked: false,
  backup_codes_remaining: 0,
}

export function useTwoFA(enabled = true) {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TwoFAStatus>(DEFAULT_STATUS)
  const [error, setError] = useState<string>()

  const fetchStatus = useCallback(async () => {
    if (!enabled) return

    try {
      setLoading(true)
      setError(undefined)
      setStatus(await get2FAStatus())
    } catch (error) {
      setError(AuthOperationError.from(error).message)
    } finally {
      setLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  }
}
