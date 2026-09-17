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
