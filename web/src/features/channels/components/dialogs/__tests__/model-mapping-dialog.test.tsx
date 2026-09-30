import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ModelMappingDialog } from '../model-mapping-dialog'

function DialogHarness(props: {
  onApply: (value: string, models: string[]) => void
  value?: string
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(props.value ?? '{"public":"provider"}')
  return (
    <>
      <button type='button' onClick={() => setOpen(true)}>
        Edit redirects
      </button>
      <ModelMappingDialog
        open={open}
        onOpenChange={setOpen}
        value={value}
        channelModels={['provider']}
        upstreamModels={['provider', 'provider-all']}
        onApply={(next, models) => {
          setValue(next)
          props.onApply(next, models)
        }}
      />
    </>
  )
}

describe('model mapping dialog session', () => {
  it('cancels edits and restores the last applied configuration when reopened', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DialogHarness onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Upstream Model Name' }),
      { target: { value: 'discarded' } }
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onApply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    expect(
      screen.getByRole('combobox', { name: 'Upstream Model Name' })
    ).toHaveValue('provider')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onApply).not.toHaveBeenCalled()
  })

  it('adds explicitly selected aliases without removing directly callable upstream models', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DialogHarness onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    expect(
      screen.getByRole('checkbox', {
        name: 'Add missing request models when applying',
      })
    ).not.toBeChecked()
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Add missing request models when applying',
      })
    )
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith('{"public":"provider"}', [
      'provider',
      'public',
    ])
  })

  it('blocks incomplete drafts and can apply removal of all mappings', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DialogHarness onApply={onApply} />)
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    await user.click(screen.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Request Model Name' })[1],
      { target: { value: 'unfinished' } }
    )
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await user.click(
      screen.getAllByRole('button', { name: 'Delete mapping' })[1]
    )
    await user.click(screen.getByRole('button', { name: 'Delete mapping' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onApply).toHaveBeenCalledWith('', ['provider'])
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    expect(
      screen.queryByRole('combobox', { name: 'Request Model Name' })
    ).not.toBeInTheDocument()
  })

  it('previews batch rules in the same modal and merges only after an explicit action', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DialogHarness onApply={onApply} value='   ' />)
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    await user.click(screen.getByRole('button', { name: 'Batch Add' }))
    await user.click(screen.getByRole('combobox', { name: 'Select models' }))
    await user.click(screen.getByRole('option', { name: 'provider-all' }))
    await user.click(screen.getByLabelText('Prefix or suffix'))
    await user.type(screen.getByLabelText('Prefix or suffix'), '-all')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(
      within(screen.getByLabelText('Mapping preview')).getByText(
        'provider → provider-all'
      )
    ).toBeVisible()
    expect(onApply).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Add 1 mapping(s)' }))
    expect(
      screen.getByRole('combobox', { name: 'Upstream Model Name' })
    ).toHaveValue('provider-all')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(JSON.parse(onApply.mock.calls[0][0])).toEqual({
      provider: 'provider-all',
    })
  })

  it('keeps an existing mapping until the user explicitly selects replacement', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn()
    render(<DialogHarness onApply={onApply} value='{"provider":"old"}' />)
    await user.click(screen.getByRole('button', { name: 'Edit redirects' }))
    await user.click(screen.getByRole('button', { name: 'Batch Add' }))
    await user.click(screen.getByRole('button', { name: 'Strip suffix: -all' }))
    expect(
      screen.getByRole('button', { name: 'Add 0 mapping(s)' })
    ).toBeDisabled()
    await user.click(
      screen.getByRole('checkbox', { name: 'Replace 1 existing mapping(s)' })
    )
    await user.click(screen.getByRole('button', { name: 'Add 1 mapping(s)' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(JSON.parse(onApply.mock.calls[0][0])).toEqual({
      provider: 'provider-all',
    })
  })
})
