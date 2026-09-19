import { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testChannelDetailed } from '@/features/channels/api'
import { channelsQueryKeys } from '@/features/channels/lib/channel-actions'
import type { ChannelProbeJob } from '@/features/channels/lib/channel-test'
import type {
  Channel,
  ChannelTestResponse,
  GetChannelsResponse,
} from '@/features/channels/types'

import { useChannelProbeStore } from '../channel-probe-store'

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    message: vi.fn(),
  },
}))
vi.mock('@/features/channels/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/channels/api')>()),
  testChannelDetailed: vi.fn(),
}))

function createDeferred() {
  let resolve!: (value: ChannelTestResponse) => void
  const promise = new Promise<ChannelTestResponse>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function successResponse(durationMs: number): ChannelTestResponse {
  return {
    success: true,
    diagnostics: {
      status: 'passed',
      reason: 'response_validated',
      endpoint_type: 'openai',
      test_type: 'basic',
      requested_stream: false,
      duration_ms: durationMs,
      event_count: 0,
      tool_count: 0,
    },
  }
}

function createJob(model: string): ChannelProbeJob {
  return {
    model,
    probe: 'basic',
    endpoint: 'auto',
    message: '',
    configurationKey: JSON.stringify([model, 'basic', 'auto', '']),
  }
}

function probeStatus(channelId: number, model: string) {
  return useChannelProbeStore.getState().sessions[channelId]?.results[model]
    ?.basic?.status
}

describe('channel probe store', () => {
  beforeEach(() => {
    useChannelProbeStore.setState({ sessions: {} })
    vi.mocked(testChannelDetailed).mockReset()
  })

  it('runs a newly clicked test while another test is still in flight', async () => {
    const queryClient = new QueryClient()
    const slow = createDeferred()
    vi.mocked(testChannelDetailed).mockImplementationOnce(() => slow.promise)
    const firstRun = useChannelProbeStore
      .getState()
      .startProbes(1, [createJob('model-a')], queryClient)

    await vi.waitFor(() => {
      expect(probeStatus(1, 'model-a')).toBe('running')
    })

    vi.mocked(testChannelDetailed).mockImplementationOnce(() =>
      Promise.resolve(successResponse(20))
    )
    useChannelProbeStore
      .getState()
      .startProbes(1, [createJob('model-b')], queryClient)

    await vi.waitFor(() => {
      expect(probeStatus(1, 'model-b')).toBe('passed')
    })
    expect(probeStatus(1, 'model-a')).toBe('running')
    expect(useChannelProbeStore.getState().sessions[1]?.isRunning).toBe(true)

    slow.resolve(successResponse(40))
    await firstRun
    expect(probeStatus(1, 'model-a')).toBe('passed')
    expect(useChannelProbeStore.getState().sessions[1]?.isRunning).toBe(false)
  })

  it('skips a duplicate click for a job that is already running', async () => {
    const queryClient = new QueryClient()
    const slow = createDeferred()
    vi.mocked(testChannelDetailed).mockImplementation(() => slow.promise)
    const run = useChannelProbeStore
      .getState()
      .startProbes(1, [createJob('model-a')], queryClient)

    await vi.waitFor(() => {
      expect(probeStatus(1, 'model-a')).toBe('running')
    })

    useChannelProbeStore
      .getState()
      .startProbes(1, [createJob('model-a')], queryClient)
    expect(testChannelDetailed).toHaveBeenCalledTimes(1)

    slow.resolve(successResponse(15))
    await run
    expect(probeStatus(1, 'model-a')).toBe('passed')
    expect(testChannelDetailed).toHaveBeenCalledTimes(1)
  })

  it('cancels queued jobs when stopped and keeps the results of active tests', async () => {
    const queryClient = new QueryClient()
    const deferreds = Array.from({ length: 6 }, () => createDeferred())
    const pending = [...deferreds]
    vi.mocked(testChannelDetailed).mockImplementation(() => {
      const deferred = pending.shift()
      if (!deferred) throw new Error('unexpected extra request')
      return deferred.promise
    })
    const jobs = Array.from({ length: 6 }, (_, index) =>
      createJob(`model-${index + 1}`)
    )
    const run = useChannelProbeStore
      .getState()
      .startProbes(3, jobs, queryClient)

    await vi.waitFor(() => {
      expect(testChannelDetailed).toHaveBeenCalledTimes(5)
    })

    useChannelProbeStore.getState().stopProbes(3)
    expect(probeStatus(3, 'model-6')).toBe('cancelled')
    expect(probeStatus(3, 'model-1')).toBe('running')

    for (const deferred of deferreds.slice(0, 5)) {
      deferred.resolve(successResponse(30))
    }
    await run

    expect(probeStatus(3, 'model-1')).toBe('passed')
    expect(probeStatus(3, 'model-6')).toBe('cancelled')
    expect(useChannelProbeStore.getState().sessions[3]?.isRunning).toBe(false)
    expect(toast.info).toHaveBeenCalledWith(
      'Testing stopped',
      expect.objectContaining({
        description: expect.stringContaining('5 passed'),
      })
    )
  })

  it('patches the channel list cache with the latest diagnostics when a run completes', async () => {
    const queryClient = new QueryClient()
    const listKey = channelsQueryKeys.list({})
    const channel = {
      id: 9,
      name: 'chan',
      response_time: 0,
      test_time: 0,
    } as Channel
    queryClient.setQueryData<GetChannelsResponse>(listKey, {
      success: true,
      data: { items: [channel], total: 1, page: 1, page_size: 10 },
    })
    vi.mocked(testChannelDetailed).mockResolvedValue(successResponse(321))

    await useChannelProbeStore
      .getState()
      .startProbes(9, [createJob('model-a')], queryClient)

    const cache = queryClient.getQueryData<GetChannelsResponse>(listKey)
    expect(cache?.data?.items[0]).toMatchObject({
      id: 9,
      response_time: 321,
    })
    expect(cache?.data?.items[0]?.test_time).toBeGreaterThan(0)
    expect(toast.info).toHaveBeenCalledWith(
      'Testing completed',
      expect.objectContaining({
        description: expect.stringContaining('1 passed'),
      })
    )
  })

  it('keeps separate background sessions for different channels', async () => {
    const queryClient = new QueryClient()
    const slow = createDeferred()
    vi.mocked(testChannelDetailed).mockImplementation((channelId) =>
      channelId === 1 ? slow.promise : Promise.resolve(successResponse(10))
    )

    void useChannelProbeStore
      .getState()
      .startProbes(1, [createJob('model-a')], queryClient)
    void useChannelProbeStore
      .getState()
      .startProbes(2, [createJob('model-a')], queryClient)

    await vi.waitFor(() => {
      expect(probeStatus(2, 'model-a')).toBe('passed')
    })
    expect(useChannelProbeStore.getState().sessions[1]?.isRunning).toBe(true)
    expect(useChannelProbeStore.getState().sessions[2]?.isRunning).toBe(false)

    slow.resolve(successResponse(50))
    await vi.waitFor(() => {
      expect(useChannelProbeStore.getState().sessions[1]?.isRunning).toBe(false)
    })
    expect(probeStatus(1, 'model-a')).toBe('passed')
  })
})
