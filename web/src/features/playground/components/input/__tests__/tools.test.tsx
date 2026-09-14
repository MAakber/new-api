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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { MCP_QUERY_KEYS } from '@/features/mcp/api'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import type { PlaygroundConfig } from '../../../types'
import { PlaygroundInputTools } from '../playground-input-tools'

let client: QueryClient

function InputTools() {
  const [config, setConfig] = useState<PlaygroundConfig>({
    ...DEFAULT_CONFIG,
    searchMode: 'mcp',
    webSearchEnabled: true,
  })
  const [enabled, setEnabled] = useState(DEFAULT_PARAMETER_ENABLED)

  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <PlaygroundInputTools
          config={config}
          onConfigChange={(key, value) =>
            setConfig((previous) => ({ ...previous, [key]: value }))
          }
          onParameterEnabledChange={(key, value) =>
            setEnabled((previous) => ({ ...previous, [key]: value }))
          }
          parameterEnabled={enabled}
        />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 390)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(MCP_QUERY_KEYS.tools, [])
})

afterEach(() => {
  client.clear()
  vi.unstubAllGlobals()
})

describe('Playground input tools', () => {
  it('collapses mobile tools by default and restores focus after keyboard dismissal', async () => {
    const user = userEvent.setup()
    render(<InputTools />)

    expect(
      screen.queryByRole('button', { name: 'Attach' })
    ).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'More' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.tab()
    expect(more).toHaveFocus()
    await user.keyboard('{Enter}')

    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'Attach' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Search mode: MCP search' })
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'MCP tools' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Parameters' })).toBeVisible()
    await user.keyboard('{Escape}{Escape}')
    await waitFor(() => expect(more).toHaveAttribute('aria-expanded', 'false'))
    expect(
      screen.queryByRole('button', { name: 'Attach' })
    ).not.toBeInTheDocument()
    expect(more).toHaveFocus()
  })

  it('opens the mobile parameter sheet from the popup and preserves edits after closing it', async () => {
    const user = userEvent.setup()
    render(<InputTools />)
    await user.click(screen.getByRole('button', { name: 'More' }))
    await user.click(screen.getByRole('button', { name: 'Parameters' }))

    expect(
      screen.getByRole('dialog', { name: 'Parameter settings' })
    ).toBeVisible()
    await user.click(
      screen.getByRole('switch', { name: 'Enable Reasoning effort' })
    )
    expect(
      screen.getByRole('switch', { name: 'Enable Reasoning effort' })
    ).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    expect(
      screen.getByRole('switch', { name: 'Enable Reasoning effort' })
    ).toBeChecked()
  })
})
