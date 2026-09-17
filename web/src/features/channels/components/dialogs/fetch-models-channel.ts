import type { Channel } from '../../types'

export function resolveFetchModelsChannel(
  explicitChannel: Channel | null | undefined,
  providerCurrentRow: Channel | null
): Channel | null {
  return explicitChannel ?? providerCurrentRow
}
