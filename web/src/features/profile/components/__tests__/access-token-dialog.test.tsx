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
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { generateAccessToken } from '../../api'
import { AccessTokenDialog } from '../dialogs/access-token-dialog'

vi.mock('../../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api')>()),
  generateAccessToken: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(generateAccessToken).mockReset().mockResolvedValue({
    success: true,
    message: '',
    data: 'local-test-access-token',
  })
})

describe('access token rotation confirmation', () => {
  it('opens without rotating and cancelling confirmation preserves the current token', async () => {
    const user = userEvent.setup()
    render(<AccessTokenDialog open onOpenChange={vi.fn()} />)
    expect(generateAccessToken).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    const confirmation = screen.getByRole('alertdialog', {
      name: 'Regenerate access token?',
    })
    expect(generateAccessToken).not.toHaveBeenCalled()
    await user.click(
      within(confirmation).getByRole('button', { name: 'Cancel' })
    )
    expect(generateAccessToken).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('rotates only after confirmation and clears the displayed token on close', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const view = render(<AccessTokenDialog open onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: 'Regenerate' }))
    await user.click(screen.getByRole('button', { name: 'Regenerate token' }))
    expect(await screen.findByRole('textbox', { name: 'Token' })).toHaveValue(
      'local-test-access-token'
    )
    expect(generateAccessToken).toHaveBeenCalledTimes(1)
    const dialog = screen.getByRole('dialog', { name: 'Access Token' })
    await user.click(
      within(dialog).getAllByRole('button', { name: 'Close' })[0]
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    view.rerender(
      <AccessTokenDialog open={false} onOpenChange={onOpenChange} />
    )
    view.rerender(<AccessTokenDialog open onOpenChange={onOpenChange} />)
    expect(screen.queryByRole('textbox', { name: 'Token' })).toBeNull()
    expect(generateAccessToken).toHaveBeenCalledTimes(1)
  })
})
