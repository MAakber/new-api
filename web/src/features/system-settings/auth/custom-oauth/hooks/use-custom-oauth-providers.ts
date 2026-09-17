import { useQuery } from '@tanstack/react-query'

import { requireServerSuccess } from '@/lib/server-error-message'

import { getCustomOAuthProviders } from '../api'

export function useCustomOAuthProviders() {
  return useQuery({
    queryKey: ['custom-oauth-providers'],
    queryFn: async () => {
      const res = requireServerSuccess(await getCustomOAuthProviders())
      return res.data ?? []
    },
  })
}
