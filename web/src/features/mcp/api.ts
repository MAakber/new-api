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
import { requireServerSuccess } from '@/lib/server-error-message'

import type { MCPServerConfig, MCPToolInfo } from './types'

export const MCP_QUERY_KEYS = {
  servers: ['mcp', 'servers'] as const,
  tools: ['mcp', 'tools'] as const,
}

export async function getMCPServers(): Promise<MCPServerConfig[]> {
  const response = await api.get('/api/mcp/servers')
  requireServerSuccess(response.data)
  return response.data.data
}

export async function saveMCPServer(
  server: MCPServerConfig
): Promise<MCPServerConfig> {
  const response = server.id
    ? await api.put(`/api/mcp/servers/${server.id}`, server)
    : await api.post('/api/mcp/servers', server)
  requireServerSuccess(response.data)
  return response.data.data
}

export async function deleteMCPServer(server: MCPServerConfig): Promise<void> {
  const response = await api.delete(`/api/mcp/servers/${server.id}`, {
    data: { revision: server.revision },
  })
  requireServerSuccess(response.data)
}

export async function testMCPServer(
  server: MCPServerConfig
): Promise<MCPToolInfo[]> {
  const response = await api.post('/api/mcp/test', server)
  requireServerSuccess(response.data)
  return response.data.data
}

export async function getAvailableMCPTools(): Promise<MCPToolInfo[]> {
  const response = await api.get('/api/mcp/tools')
  requireServerSuccess(response.data)
  return response.data.data
}
