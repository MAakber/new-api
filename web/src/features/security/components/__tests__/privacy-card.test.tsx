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
import { describe, expect, it } from 'vitest'

import { PrivacyCard } from '../privacy-card'

describe('mandatory IP auditing', () => {
  it('shows enabled recording without offering an ineffective user toggle', () => {
    render(<PrivacyCard />)
    expect(screen.getByText('Record IP Address')).toBeVisible()
    expect(screen.getByText('Enabled')).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save Settings' })
    ).not.toBeInTheDocument()
  })
})
