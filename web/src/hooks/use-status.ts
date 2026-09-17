import { useQuery } from '@tanstack/react-query'

import type { SystemStatus } from '@/features/auth/types'
import { readCachedStatus, statusQueryOptions } from '@/lib/status-query'

/** Seed value from the persisted snapshot, so the first render is not empty. */
function getInitialStatus(): SystemStatus | undefined {
  return (readCachedStatus() as SystemStatus | null) ?? undefined
}

/**
 * Subscribe to the shared `/api/status` query.
 *
 * Every caller reads the same cache entry, so mounting this hook in several
 * components costs one request. See `statusQueryOptions` for cache lifetimes.
 */
export function useStatus() {
  const { data, isLoading, error } = useQuery({
    ...statusQueryOptions,
    // Use localStorage data as initial data
    placeholderData: getInitialStatus(),
  })

  return {
    status: (data as SystemStatus | null) ?? null,
    loading: isLoading,
    error,
  }
}
