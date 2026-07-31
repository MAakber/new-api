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
/**
 * Zod schemas for common logs
 * This file should only contain Zod schemas and types inferred from them
 */
import { z } from 'zod'

const requestDebugHeadersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.boolean()])
)

export const requestDebugEntrySchema = z.object({
  headers: requestDebugHeadersSchema.optional(),
  method: z.string().optional(),
  url: z.string().optional(),
  host: z.string().optional(),
  remote_addr: z.string().optional(),
  body_bytes: z.number().optional(),
  body_bytes_known: z.boolean().optional(),
  body: z.string().optional(),
  body_encoding: z.string().optional(),
  body_available: z.boolean().optional(),
  body_ref: z.string().optional(),
  body_truncated: z.boolean().optional(),
  stored_bytes: z.number().optional(),
  content_type: z.string().optional(),
  compression: z.string().optional(),
  status: z.number().optional(),
  protocol: z.string().optional(),
  truncated: z.boolean().optional(),
})

export const requestDebugSchema = z.object({
  inbound: requestDebugEntrySchema.optional(),
  upstream: requestDebugEntrySchema.optional(),
  response: requestDebugEntrySchema.optional(),
})

export type RequestDebugEntry = z.infer<typeof requestDebugEntrySchema>
export type RequestDebug = z.infer<typeof requestDebugSchema>

// Usage log schema
export const usageLogSchema = z.object({
  id: z.number(),
  user_id: z.number(),
  created_at: z.number(),
  type: z.number(),
  content: z.string(),
  username: z.string().default(''),
  token_name: z.string().default(''),
  model_name: z.string().default(''),
  quota: z.number().default(0),
  prompt_tokens: z.number().default(0),
  completion_tokens: z.number().default(0),
  use_time: z.number().default(0),
  is_stream: z.boolean().default(false),
  channel: z.number().default(0),
  channel_name: z.string().nullish().default(''),
  token_id: z.number().default(0),
  group: z.string().default(''),
  ip: z.string().default(''),
  other: z.string().default(''),
  request_id: z.string().default(''),
  upstream_request_id: z.string().default(''),
})

export type UsageLog = z.infer<typeof usageLogSchema>
