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
