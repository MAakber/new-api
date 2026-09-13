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
// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { api } from '@/lib/api'

import { DEFAULT_CONFIG } from '../../../constants'
import { PlaygroundSearchTools } from '../playground-search-tools'

let client: QueryClient

function SearchTools(props: { disabled?: boolean }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <PlaygroundSearchTools
          config={config}
          disabled={props.disabled}
          onConfigChange={(key, value) =>
            setConfig((previous) => ({ ...previous, [key]: value }))
          }
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
})
afterEach(() => {
  client.clear()
})

describe('Search and MCP tool selection', () => {
  it('switches between off, MCP and native search with the selected state exposed to the keyboard', async () => {
    const user = userEvent.setup()
    render(<SearchTools />)
    await user.tab()
    expect(
      screen.getByRole('button', { name: 'Search mode: Search off' })
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('menuitemradio', { name: 'Search off' })
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.queryByText(
        'MCP search uses administrator-configured search tools. Native search requires support from the selected model and channel.'
      )
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitemradio', { name: 'MCP search' }))
    expect(
      screen.getByRole('menuitemradio', { name: 'MCP search' })
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(
      screen.getByRole('menuitemradio', { name: 'Model native search' })
    )
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: 'Search mode: Model native search' })
    ).toBeVisible()
  })

  it('shows an empty pool in the selector and prevents changing tools while generation is disabled', async () => {
    const user = userEvent.setup()
    const rendered = render(<SearchTools />)
    await user.click(screen.getByRole('button', { name: 'MCP tools' }))
    expect(
      screen.queryByText(
        'No MCP tools are available. Ask an administrator to configure MCP services.'
      )
    ).not.toBeInTheDocument()
    await user.click(await screen.findByRole('combobox', { name: 'MCP tools' }))
    expect(
      await screen.findByText(
        'No MCP tools are available. Ask an administrator to configure MCP services.'
      )
    ).toBeVisible()
    await user.keyboard('{Escape}')
    rendered.rerender(<SearchTools disabled />)
    expect(screen.getByRole('combobox', { name: 'MCP tools' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Search mode: Search off' })
    ).toBeDisabled()
  })

  it('selects a tool by its server and name and shows the selected count', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: '1:lookup',
            server_id: 1,
            server_name: 'Reference service',
            name: 'lookup',
            description: '',
            kind: 'tool',
            read_only: true,
          },
        ],
      },
    })
    const user = userEvent.setup()
    render(<SearchTools />)
    await user.click(screen.getByRole('button', { name: 'MCP tools' }))
    expect(
      screen.queryByText(
        'Select extra tools for this conversation. MCP search automatically includes enabled search and page-fetching tools.'
      )
    ).not.toBeInTheDocument()
    await user.click(await screen.findByRole('combobox', { name: 'MCP tools' }))
    await user.click(
      await screen.findByRole('option', { name: 'Reference service · lookup' })
    )
    await user.keyboard('{Escape}{Escape}')
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'MCP tools' })
      ).toHaveTextContent('1')
    )
  })
})
