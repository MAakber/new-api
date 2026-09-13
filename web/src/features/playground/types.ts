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
// Message types
export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'loading' | 'streaming' | 'complete' | 'error'

export type PlaygroundMessageLayoutMode = 'alternating' | 'left'

export type SearchMode = 'off' | 'mcp' | 'native'

export interface PlaygroundUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cached_tokens?: number
  cache_write_tokens?: number
  reasoning_tokens?: number
  estimated?: boolean
  partial?: boolean
  rounds?: number
  model_duration_ms?: number
  generation_duration_ms?: number
  first_token_ms?: number
}

export interface PlaygroundToolCall {
  id: string
  round_id: number
  server_name: string
  name: string
  kind: 'search' | 'fetch' | 'tool'
  state: 'running' | 'completed' | 'error' | 'cancelled'
  input: Record<string, unknown>
  output?: string
  error?: string
  duration_ms: number
}

export interface PlaygroundPart {
  type: 'text' | 'reasoning' | 'tool'
  text?: string
  tool_call_id?: string
  round_id: number
}

export interface PlaygroundRun {
  run_id: string
  search_mode: SearchMode
  usage?: PlaygroundUsage
  parts: PlaygroundPart[]
  tool_calls: PlaygroundToolCall[]
  duration_ms?: number
}

export type PlaygroundEvent =
  | { type: 'run'; run_id: string; search_mode: SearchMode }
  | {
      type: 'delta'
      round_id: number
      content?: string
      reasoning_content?: string
    }
  | { type: 'usage'; usage: PlaygroundUsage }
  | { type: 'tool'; tool: PlaygroundToolCall }
  | {
      type: 'complete'
      duration_ms: number
      sources: WebSearchSource[]
      usage: PlaygroundUsage
    }
  | { type: 'ping' }

export type MessageSnapshot = Pick<
  Message,
  | 'run'
  | 'sources'
  | 'reasoning'
  | 'createdAt'
  | 'startedAt'
  | 'completedAt'
  | 'durationMs'
  | 'status'
  | 'errorMessage'
  | 'errorCode'
>

export interface MessageVersion {
  id: string
  content: string
  snapshot?: MessageSnapshot
}

export interface WebSearchSource {
  href: string
  title: string
  id?: string
  tool_call_id?: string
  published_at?: string
  cited?: boolean
}

export interface Message {
  key: string
  from: MessageRole
  versions: MessageVersion[]
  createdAt?: number
  startedAt?: number
  completedAt?: number
  durationMs?: number
  run?: PlaygroundRun
  sources?: WebSearchSource[]
  reasoning?: {
    content: string
    duration: number
    startedAt?: number
    completedAt?: number
    durationMs?: number
  }
  isReasoningStreaming?: boolean
  isReasoningComplete?: boolean
  isContentComplete?: boolean
  status?: MessageStatus
  errorCode?: string | null
  errorMessage?: string
}

// API payload types
export interface ChatCompletionMessage {
  role: MessageRole
  content: string | ContentPart[]
}

export interface ContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: {
    url: string
  }
}

export interface ChatCompletionRequest {
  model: string
  group?: string
  messages: ChatCompletionMessage[]
  stream: boolean
  web_search?: boolean
  search_mode?: SearchMode
  mcp_tools?: string[]
  temperature?: number
  top_p?: number
  max_tokens?: number
  frequency_penalty?: number
  presence_penalty?: number
  seed?: number
  reasoning_effort?: string
}

export interface ChatCompletionChunk {
  id: string
  object: string
  created: number
  model: string
  playground?: PlaygroundEvent
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: {
      cached_tokens?: number
      cache_write_tokens?: number
      cached_creation_tokens?: number
    }
    completion_tokens_details?: { reasoning_tokens?: number }
  }
  choices: Array<{
    index: number
    delta: {
      role?: MessageRole
      content?: string
      reasoning_content?: string
      web_search?: {
        sources?: WebSearchSource[]
      }
    }
    finish_reason: string | null
  }>
}

export interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: MessageRole
      content: string
      reasoning_content?: string
    }
    finish_reason: string
  }>
  sources?: WebSearchSource[]
  playground?: PlaygroundRun
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

// Configuration types
export interface PlaygroundConfig {
  model: string
  group: string
  temperature: number
  top_p: number
  max_tokens: number
  frequency_penalty: number
  presence_penalty: number
  seed: number | null
  reasoning_effort: string
  stream: boolean
  webSearchEnabled: boolean
  searchMode?: SearchMode
  mcpTools?: string[]
}

export interface ParameterEnabled {
  temperature: boolean
  top_p: boolean
  max_tokens: boolean
  frequency_penalty: boolean
  presence_penalty: boolean
  seed: boolean
  reasoning_effort: boolean
}

// Model and group options
export interface ModelOption {
  label: string
  value: string
}

export interface GroupOption {
  label: string
  value: string
  ratio: number
  desc?: string
}
