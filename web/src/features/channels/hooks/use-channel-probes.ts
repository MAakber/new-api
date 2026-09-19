import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { useChannelProbeStore } from '@/stores/channel-probe-store'

import type { ChannelProbeJob, ChannelProbeResults } from '../lib/channel-test'
import type { Channel } from '../types'

const EMPTY_RESULTS: ChannelProbeResults = {}
const EMPTY_RUN_JOBS: ChannelProbeJob[] = []

// Probe sessions live in the global probe store, so tests keep running after
// the dialog closes and reopening restores the live results.
export function useChannelProbes(channel: Channel) {
  const queryClient = useQueryClient()
  const channelId = channel.id
  const session = useChannelProbeStore((state) => state.sessions[channelId])
  const startProbes = useChannelProbeStore((state) => state.startProbes)
  const stopProbes = useChannelProbeStore((state) => state.stopProbes)

  const start = useCallback(
    (jobs: ChannelProbeJob[]) => {
      void startProbes(channelId, jobs, queryClient)
    },
    [channelId, queryClient, startProbes]
  )
  const stop = useCallback(() => stopProbes(channelId), [channelId, stopProbes])

  const results = session?.results ?? EMPTY_RESULTS
  const runJobs = session?.runJobs ?? EMPTY_RUN_JOBS
  const runResults = runJobs.map((job) => results[job.model]?.[job.probe])
  const progress = {
    total: runJobs.length,
    completed: runResults.filter(
      (result) =>
        result && !['queued', 'running', 'cancelled'].includes(result.status)
    ).length,
    passed: runResults.filter((result) => result?.status === 'passed').length,
    failed: runResults.filter((result) => result?.status === 'failed').length,
    degraded: runResults.filter((result) => result?.status === 'degraded')
      .length,
    skipped: runResults.filter((result) => result?.status === 'skipped').length,
    cancelled: runResults.filter((result) => result?.status === 'cancelled')
      .length,
  }

  return {
    results,
    isRunning: session?.isRunning ?? false,
    isStopping: session?.isStopping ?? false,
    progress,
    start,
    stop,
  }
}
