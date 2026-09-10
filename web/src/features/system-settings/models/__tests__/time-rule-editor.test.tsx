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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { TieredPricingEditor } from '../tiered-pricing-editor'

function EditorFixture({ initialRule }: { initialRule: string }) {
  const [billingExpr, setBillingExpr] = useState('tier("base", p * 2 + c * 4)')
  const [requestRuleExpr, setRequestRuleExpr] = useState(initialRule)
  return (
    <>
      <TieredPricingEditor
        billingExpr={billingExpr}
        requestRuleExpr={requestRuleExpr}
        onBillingExprChange={setBillingExpr}
        onRequestRuleExprChange={setRequestRuleExpr}
      />
      <output aria-label='Saved request rule draft'>{requestRuleExpr}</output>
    </>
  )
}

describe('saved request rules in the pricing editor', () => {
  it('keeps a saved unsupported rule when opening the visual editor', async () => {
    const initialRule = '(hour("UTC") == 8 || hour("UTC") == 12 ? 2 : 1)'
    render(<EditorFixture initialRule={initialRule} />)

    await screen.findByText(
      'This expression is too complex for the visual editor. Please switch to expression mode to edit.'
    )
    expect(screen.getByLabelText('Saved request rule draft').textContent).toBe(
      initialRule
    )
  })

  it('explains daytime and overnight ranges and applies an edited end bound', async () => {
    render(
      <EditorFixture initialRule='(hour("UTC") >= 9 && hour("UTC") < 12 ? 2 : 1)' />
    )

    await screen.findByText(
      'Start ≤ end: within the day; start > end: across midnight'
    )
    const end = screen.getByDisplayValue('12')
    fireEvent.change(end, { target: { value: '13' } })
    fireEvent.blur(end)
    await waitFor(() => {
      expect(
        screen.getByLabelText('Saved request rule draft').textContent
      ).toBe('(hour("UTC") >= 9 && hour("UTC") < 13 ? 2 : 1)')
    })
  })
})
