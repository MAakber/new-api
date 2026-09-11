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
