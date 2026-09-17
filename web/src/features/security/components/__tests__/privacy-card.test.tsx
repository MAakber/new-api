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
