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
import { z } from 'zod'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const duration = z.number().finite().nonnegative()
export const searchModeSchema = z.enum(['off', 'mcp', 'native'])

export const playgroundUsageSchema = z.object({
  input_tokens: count.optional(),
  output_tokens: count.optional(),
  total_tokens: count.optional(),
  cached_tokens: count.optional(),
  cache_write_tokens: count.optional(),
  reasoning_tokens: count.optional(),
  estimated: z.boolean().optional(),
  partial: z.boolean().optional(),
  rounds: count.optional(),
  model_duration_ms: duration.optional(),
  generation_duration_ms: duration.optional(),
  first_token_ms: duration.optional(),
})

export const sourceSchema = z.object({
  href: z.string().max(8192),
  title: z.string().max(4096),
  id: z.string().max(256).optional(),
  tool_call_id: z.string().max(256).optional(),
  published_at: z.string().max(256).optional(),
  cited: z.boolean().optional(),
})

const toolSchema = z.object({
  id: z.string().max(256),
  round_id: count,
  server_name: z.string().max(256),
  name: z.string().max(256),
  kind: z.enum(['search', 'fetch', 'tool']),
  state: z.enum(['running', 'completed', 'error', 'cancelled']),
  input: z.record(z.string(), z.unknown()),
  output: z
    .string()
    .max(128 * 1024)
    .optional(),
  error: z.string().max(8192).optional(),
  duration_ms: duration,
})

const partSchema = z.object({
  type: z.enum(['text', 'reasoning', 'tool']),
  text: z.string().optional(),
  tool_call_id: z.string().max(256).optional(),
  round_id: count,
})

export const playgroundRunSchema = z.object({
  run_id: z.string().max(256),
  search_mode: searchModeSchema,
  usage: playgroundUsageSchema.optional(),
  parts: z.array(partSchema),
  tool_calls: z.array(toolSchema).max(16),
  duration_ms: duration.optional(),
})

export const playgroundFailureSchema = z.object({
  playground: playgroundRunSchema,
  sources: z.array(sourceSchema).default([]),
})

export const playgroundEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run'),
    run_id: z.string().max(256),
    search_mode: searchModeSchema,
  }),
  z.object({
    type: z.literal('delta'),
    round_id: count,
    content: z.string().optional(),
    reasoning_content: z.string().optional(),
  }),
  z.object({ type: z.literal('usage'), usage: playgroundUsageSchema }),
  z.object({ type: z.literal('tool'), tool: toolSchema }),
  z.object({
    type: z.literal('complete'),
    duration_ms: duration,
    sources: z.array(sourceSchema),
    usage: playgroundUsageSchema,
  }),
  z.object({ type: z.literal('ping') }),
])
