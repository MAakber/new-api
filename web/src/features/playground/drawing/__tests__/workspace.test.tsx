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
import { ReactFlowProvider } from '@xyflow/react'
import { describe, it, expect } from 'vitest'

import { DrawingWorkspace } from '../components/DrawingWorkspace'

describe('Drawing workspace', () => {
  it('shows the empty canvas and settings when no reference image or mask exists', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    client.setQueryData(
      ['drawing-groups', 801],
      [{ value: 'default', label: 'default', ratio: 1 }]
    )
    client.setQueryData(
      ['drawing-models', 801, 'default'],
      [{ value: 'gpt-image-1', label: 'gpt-image-1' }]
    )
    render(
      <QueryClientProvider client={client}>
        <ReactFlowProvider>
          <DrawingWorkspace userId={801} />
        </ReactFlowProvider>
      </QueryClientProvider>
    )
    await waitFor(() =>
      expect(screen.getByText('Room for every idea')).toBeTruthy()
    )
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Generate images' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    client.clear()
  })
})
