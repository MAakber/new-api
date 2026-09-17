export type MCPToolKind = 'search' | 'fetch' | 'tool'

export interface MCPToolConfig {
  name: string
  description?: string
  enabled: boolean
  read_only: boolean
  kind: MCPToolKind
  schema_hash: string
}

export interface MCPCredentials {
  headers?: Record<string, string>
  query?: Record<string, string>
}

export interface MCPServerConfig {
  id: number
  name: string
  url: string
  enabled: boolean
  groups: string[]
  tools: MCPToolConfig[]
  timeout_seconds: number
  max_concurrency: number
  revision: number
  credential_set: boolean
  credentials?: MCPCredentials
}

export interface MCPToolInfo {
  id: string
  server_id: number
  server_name: string
  name: string
  description: string
  input_schema?: Record<string, unknown>
  schema_hash?: string
  read_only: boolean
  kind: MCPToolKind
}
