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
