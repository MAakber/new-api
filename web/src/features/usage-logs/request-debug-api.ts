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
import { api } from '@/lib/api'

export async function getRequestDebugBody(requestId: string) {
  const res = await api.get(
    `/api/log/${encodeURIComponent(requestId)}/request-body`
  )
  return res.data as {
    success: boolean
    message: string
    data?: {
      body?: string
      body_encoding?: string
      body_truncated?: boolean
      body_bytes?: number
      stored_bytes?: number
      content_type?: string
      compression?: string
    }
  }
}
