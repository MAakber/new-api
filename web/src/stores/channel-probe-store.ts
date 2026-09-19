import type { QueryClient } from '@tanstack/react-query'
import i18next from 'i18next'
import { toast } from 'sonner'
import { create } from 'zustand'

import { testChannelDetailed } from '@/features/channels/api'
import { channelsQueryKeys } from '@/features/channels/lib/channel-actions'
import {
  CHANNEL_PROBE_BY_ID,
  channelProbeQueue,
  type ChannelProbeJob,
  type ChannelProbeResult,
  type ChannelProbeResults,
} from '@/features/channels/lib/channel-test'
import type {
  GetChannelsResponse,
  SearchChannelsResponse,
} from '@/features/channels/types'

export type ChannelProbeSession = {
  results: ChannelProbeResults
  runJobs: ChannelProbeJob[]
  isRunning: boolean
  isStopping: boolean
}

export type ChannelProbeStore = {
  sessions: Record<number, ChannelProbeSession>
  /**
   * Start or append a probe run. Called while another run is active, the jobs
   * join that run, so individually clicked tests queue up instead of waiting
   * for the running batch to finish.
   */
  startProbes: (
    channelId: number,
    requestedJobs: ChannelProbeJob[],
    queryClient: QueryClient
  ) => Promise<void>
  stopProbes: (channelId: number) => void
}

type ProbeRun = {
  stopped: boolean
  jobs: ChannelProbeJob[]
  pending: number
  completed: ChannelProbeResult[]
}

const EMPTY_SESSION: ChannelProbeSession = {
  results: {},
  runJobs: [],
  isRunning: false,
  isStopping: false,
}

// One active run per channel, kept outside React so a closed test dialog no
// longer cancels it. Appending to a stopped run starts a fresh run while the
// stopped one finishes its active requests.
const activeRuns = new Map<number, ProbeRun>()

export const useChannelProbeStore = create<ChannelProbeStore>()((set, get) => ({
  sessions: {},

  startProbes: async (channelId, requestedJobs, queryClient) => {
    if (requestedJobs.length === 0) return
    const results = get().sessions[channelId]?.results ?? EMPTY_SESSION.results
    const batch = [
      ...new Map(
        requestedJobs.map((job) => [job.configurationKey, job])
      ).values(),
    ].filter((job) => {
      const current = results[job.model]?.[job.probe]
      return !(
        current &&
        current.configurationKey === job.configurationKey &&
        (current.status === 'queued' || current.status === 'running')
      )
    })
    if (batch.length === 0) return

    const existing = activeRuns.get(channelId)
    const run: ProbeRun =
      existing && !existing.stopped
        ? existing
        : { stopped: false, jobs: [], pending: 0, completed: [] }
    activeRuns.set(channelId, run)
    run.jobs.push(...batch)
    run.pending += batch.length

    set((state) => {
      const session = state.sessions[channelId] ?? EMPTY_SESSION
      const nextResults = { ...session.results }
      for (const job of batch) {
        nextResults[job.model] = {
          ...nextResults[job.model],
          [job.probe]: { ...job, status: 'queued' },
        }
      }
      return {
        sessions: {
          ...state.sessions,
          [channelId]: {
            ...session,
            results: nextResults,
            runJobs: [...run.jobs],
            isRunning: true,
            isStopping: false,
          },
        },
      }
    })

    await Promise.allSettled(
      batch.map((job) =>
        channelProbeQueue.schedule(
          () => runProbeJob(channelId, run, job),
          () => run.stopped
        )
      )
    )

    run.pending -= batch.length
    if (run.pending === 0) {
      finalizeRun(channelId, run, queryClient)
    }
  },

  stopProbes: (channelId) => {
    const run = activeRuns.get(channelId)
    if (!run) return
    run.stopped = true
    channelProbeQueue.flushCancelled()
    set((state) => {
      const session = state.sessions[channelId]
      if (!session) return state
      const results = { ...session.results }
      for (const job of run.jobs) {
        const result = results[job.model]?.[job.probe]
        if (result?.status === 'queued') {
          results[job.model] = {
            ...results[job.model],
            [job.probe]: { ...result, status: 'cancelled' },
          }
        }
      }
      return {
        sessions: {
          ...state.sessions,
          [channelId]: { ...session, results, isStopping: true },
        },
      }
    })
  },
}))

function setProbeResult(
  channelId: number,
  job: ChannelProbeJob,
  result: ChannelProbeResult
) {
  useChannelProbeStore.setState((state) => {
    const session = state.sessions[channelId] ?? EMPTY_SESSION
    return {
      sessions: {
        ...state.sessions,
        [channelId]: {
          ...session,
          results: {
            ...session.results,
            [job.model]: {
              ...session.results[job.model],
              [job.probe]: result,
            },
          },
        },
      },
    }
  })
}

async function runProbeJob(
  channelId: number,
  run: ProbeRun,
  job: ChannelProbeJob
) {
  setProbeResult(channelId, job, { ...job, status: 'running' })
  const spec = CHANNEL_PROBE_BY_ID[job.probe]
  let result: ChannelProbeResult
  try {
    const response = await testChannelDetailed(channelId, {
      model: job.model,
      endpoint_type: job.endpoint === 'auto' ? '' : job.endpoint,
      stream: spec.stream,
      test_type: spec.testType,
      message: spec.testType === 'tool_call' ? '' : job.message,
    })
    result = {
      ...job,
      status: response.diagnostics?.status ?? 'failed',
      diagnostics: response.diagnostics,
      completedAt: Date.now(),
      error: response.message || response.diagnostics?.detail,
      errorCode: response.diagnostics
        ? response.error_code
        : 'diagnostics_unavailable',
      preview: response.response_preview,
    }
  } catch (error: unknown) {
    const failure = error as {
      response?: { data?: { message?: string; error_code?: string } }
    }
    result = {
      ...job,
      status: 'failed',
      completedAt: Date.now(),
      error:
        failure.response?.data?.message ||
        i18next.t('The test request failed.'),
      errorCode: failure.response?.data?.error_code,
    }
  }
  run.completed.push(result)
  setProbeResult(channelId, job, result)
}

function finalizeRun(
  channelId: number,
  run: ProbeRun,
  queryClient: QueryClient
) {
  const isActiveRun = activeRuns.get(channelId) === run
  if (isActiveRun) {
    activeRuns.delete(channelId)
  }
  reportRunResults(channelId, run, queryClient)
  if (!isActiveRun) return
  useChannelProbeStore.setState((state) => {
    const session = state.sessions[channelId]
    if (!session) return state
    return {
      sessions: {
        ...state.sessions,
        [channelId]: { ...session, isRunning: false, isStopping: false },
      },
    }
  })
}

function reportRunResults(
  channelId: number,
  run: ProbeRun,
  queryClient: QueryClient
) {
  const latest = run.completed
    .filter((result) => result.diagnostics && result.status !== 'skipped')
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]
  if (latest?.diagnostics) {
    const patch = {
      response_time: latest.diagnostics.duration_ms,
      test_time: Math.floor((latest.completedAt ?? Date.now()) / 1000),
    }
    queryClient.setQueriesData<GetChannelsResponse | SearchChannelsResponse>(
      { queryKey: channelsQueryKeys.lists() },
      (previous) => {
        if (!previous?.data?.items) return previous
        return {
          ...previous,
          data: {
            ...previous.data,
            items: previous.data.items.map((item) =>
              item.id === channelId ? { ...item, ...patch } : item
            ),
          },
        }
      }
    )
    void queryClient.invalidateQueries({
      queryKey: channelsQueryKeys.lists(),
    })
  }
  const passed = run.completed.filter(
    (result) => result.status === 'passed'
  ).length
  const failed = run.completed.filter(
    (result) => result.status === 'failed'
  ).length
  const degraded = run.completed.filter(
    (result) => result.status === 'degraded'
  ).length
  const title = run.stopped
    ? i18next.t('Testing stopped')
    : i18next.t('Testing completed')
  const description = i18next.t(
    '{{passed}} passed · {{failed}} failed · {{degraded}} compatibility',
    { passed, failed, degraded }
  )
  if (failed > 0) toast.error(title, { description })
  else toast.info(title, { description })
}
