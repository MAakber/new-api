import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG, DEFAULT_PARAMETER_ENABLED } from '../../../constants'
import { PlaygroundParameterPanel } from '../playground-parameter-panel'

function ParameterPanel() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [enabled, setEnabled] = useState(DEFAULT_PARAMETER_ENABLED)
  return (
    <PlaygroundParameterPanel
      config={config}
      parameterEnabled={enabled}
      onConfigChange={(key, value) =>
        setConfig((previous) => ({ ...previous, [key]: value }))
      }
      onParameterEnabledChange={(key, value) =>
        setEnabled((previous) => ({ ...previous, [key]: value }))
      }
    />
  )
}

describe('Reasoning effort control', () => {
  it('selects a suggested effort using the keyboard', async () => {
    const user = userEvent.setup()
    render(<ParameterPanel />)
    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    await user.click(
      screen.getByRole('switch', { name: 'Enable Reasoning effort' })
    )
    const input = screen.getByRole('combobox', {
      name: 'Reasoning effort',
    }) as HTMLInputElement
    await user.clear(input)
    await user.type(input, 'xh')
    expect(screen.getByRole('option', { name: 'xhigh' })).toBeTruthy()
    await user.keyboard('{ArrowDown}{Enter}{Tab}')
    expect(input.value).toBe('xhigh')
  })

  it('enables reasoning effort, accepts a custom level and disables the input with its toggle', async () => {
    const user = userEvent.setup()
    render(<ParameterPanel />)
    await user.click(screen.getByRole('button', { name: 'Parameters' }))
    const toggle = screen.getByRole('switch', {
      name: 'Enable Reasoning effort',
    })
    const input = screen.getByRole('combobox', {
      name: 'Reasoning effort',
    }) as HTMLInputElement
    expect(input.disabled).toBe(true)
    await user.click(toggle)
    expect(input.disabled).toBe(false)
    await user.clear(input)
    await user.type(input, 'custom-effort')
    await user.keyboard('{Tab}')
    expect(input.value).toBe('custom-effort')
    await user.click(toggle)
    expect(input.disabled).toBe(true)
  })
})
