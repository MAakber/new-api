export type AutoSyncTaskStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export type PricingSourceDescriptor = {
  kind: 'real_channel' | 'official' | 'models_dev'
  channel_id?: number
  channel_type?: number
  resolved_base_url?: string
  endpoint_mode?: string
  endpoint?: string
}

export type AutoSyncTaskProjection = {
  task_id: string
  status: AutoSyncTaskStatus
  result?: Record<string, unknown>
  error?: string
  created_at: number
  updated_at: number
}

export type AutoSyncStatus = {
  pending_events: number
  due_at: number
  running?: AutoSyncTaskProjection
  latest?: AutoSyncTaskProjection
}

export type AutoPriceSyncStatusView = {
  config: {
    enabled: boolean
    source?: PricingSourceDescriptor
  }
  status: AutoSyncStatus
}

export type AutoModelSyncStatusView = {
  enabled: boolean
  status: AutoSyncStatus
}

export type AutoSyncResponse<T> = {
  success: boolean
  message?: string
  data?: T
}
