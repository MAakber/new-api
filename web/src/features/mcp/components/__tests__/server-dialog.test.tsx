import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import type { MCPServerConfig, MCPToolInfo } from '../../types'
import { MCPServerDialog } from '../mcp-server-dialog'

const server: MCPServerConfig = {
  id: 1,
  revision: 1,
  name: 'Search service',
  url: 'https://mcp.example.com/mcp',
  enabled: true,
  groups: ['default'],
  tools: [],
  timeout_seconds: 30,
  max_concurrency: 4,
  credential_set: true,
}
let client: QueryClient

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: ['default'] },
  })
})
afterEach(() => {
  client.clear()
})

describe('MCP service configuration', () => {
  it('associates the group selector with its visible label', async () => {
    render(
      <QueryClientProvider client={client}>
        <MCPServerDialog server={server} onClose={vi.fn()} />
      </QueryClientProvider>
    )
    expect(await screen.findByLabelText('Allowed user groups')).toHaveAttribute(
      'role',
      'combobox'
    )
    expect(
      screen.getByRole('combobox', { name: 'Allowed user groups' })
    ).toBeVisible()
  })

  it('locks credentials and access controls during discovery and requires approval before saving a new tool', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    let finishDiscovery!: (value: {
      data: { success: boolean; data: MCPToolInfo[] }
    }) => void
    vi.spyOn(api, 'post').mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDiscovery = resolve
        })
    )
    const save = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true, data: server } })
    render(
      <QueryClientProvider client={client}>
        <MCPServerDialog server={server} onClose={onClose} />
      </QueryClientProvider>
    )
    await user.click(
      screen.getByRole('button', { name: 'Test connection and discover tools' })
    )
    const enabled = screen.getByRole('switch', { name: 'Enabled' })
    expect(enabled).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('checkbox', { name: 'Clear stored credentials' })
    ).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    await act(async () =>
      finishDiscovery({
        data: {
          success: true,
          data: [
            {
              id: '1:search',
              server_id: 1,
              server_name: server.name,
              name: 'search',
              description: 'Search the web',
              schema_hash: 'approved-schema',
              read_only: true,
              kind: 'tool',
            },
          ],
        },
      })
    )
    const enableTool = await screen.findByRole('switch', { name: 'search' })
    expect(enableTool).toHaveAttribute('aria-disabled', 'true')
    expect(enabled).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(
      screen.getByRole('checkbox', { name: 'Read-only access confirmed' })
    )
    await user.click(enableTool)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(save).toHaveBeenCalledWith(
      '/api/mcp/servers/1',
      expect.objectContaining({
        credentials: undefined,
        tools: [
          expect.objectContaining({
            name: 'search',
            enabled: true,
            read_only: true,
            schema_hash: 'approved-schema',
          }),
        ],
      })
    )
  })
})
