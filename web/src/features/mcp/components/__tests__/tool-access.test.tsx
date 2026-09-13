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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import type { MCPToolConfig } from '../../types'
import { MCPToolConfigList } from '../mcp-tool-config-list'

function ToolAccess() {
  const [tools, setTools] = useState<MCPToolConfig[]>([
    {
      name: 'search',
      enabled: false,
      read_only: false,
      kind: 'tool',
      schema_hash: 'approved',
    },
  ])
  return <MCPToolConfigList tools={tools} onChange={setTools} />
}

describe('MCP tool access', () => {
  it('requires explicit read-only confirmation and revokes enablement when confirmation is removed', async () => {
    const user = userEvent.setup()
    render(<ToolAccess />)
    const enable = screen.getByRole('switch', { name: 'search' })
    expect(enable).toHaveAttribute('aria-disabled', 'true')
    const confirmation = screen.getByRole('checkbox', {
      name: 'Read-only access confirmed',
    })
    await user.click(confirmation)
    expect(enable).not.toHaveAttribute('aria-disabled', 'true')
    await user.click(enable)
    expect(enable).toHaveAttribute('aria-checked', 'true')
    await user.click(confirmation)
    expect(enable).toHaveAttribute('aria-disabled', 'true')
    expect(enable).toHaveAttribute('aria-checked', 'false')
  })
})
