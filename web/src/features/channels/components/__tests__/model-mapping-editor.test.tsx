import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ModelMappingEditor } from '../model-mapping-editor'

function ControlledEditor() {
  const [value, setValue] = useState('')
  return <ModelMappingEditor value={value} onChange={setValue} />
}

describe('model mapping draft', () => {
  it('keeps a new blank row in a controlled editor', () => {
    render(<ControlledEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Mapping' }))
    expect(screen.getByPlaceholderText('gpt-3.5-turbo')).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('gpt-3.5-turbo-0125')
    ).toBeInTheDocument()
  })

  it('keeps unfinished rows when another row changes or the language changes', async () => {
    render(<ControlledEditor />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Request Model Name' }),
      { target: { value: 'public' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Upstream Model Name' })[1],
      { target: { value: 'unfinished' } }
    )
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Upstream Model Name' })[0],
      { target: { value: 'provider' } }
    )
    await act(() => i18next.changeLanguage('zh'))
    expect(
      screen.getAllByRole('combobox', { name: 'Upstream Model Name' })[1]
    ).toHaveValue('unfinished')
    await act(() => i18next.changeLanguage('en'))
  })

  it('blocks duplicate sources without replacing the last valid JSON and recovers when corrected', () => {
    const onChange = vi.fn()
    const onValidityChange = vi.fn()
    render(
      <ModelMappingEditor
        value='{"a":"upstream"}'
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Request Model Name' })[1],
      { target: { value: ' a ' } }
    )
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Upstream Model Name' })[1],
      { target: { value: 'different' } }
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Duplicate source model mappings are not allowed'
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(onValidityChange).toHaveBeenLastCalledWith(false)
    fireEvent.change(
      screen.getAllByRole('combobox', { name: 'Request Model Name' })[1],
      { target: { value: 'b' } }
    )
    expect(JSON.parse(onChange.mock.lastCall?.[0] ?? '')).toEqual({
      a: 'upstream',
      b: 'different',
    })
    expect(onValidityChange).toHaveBeenLastCalledWith(true)
  })

  it('retains invalid JSON until it is fixed and then restores visual editing', () => {
    render(<ControlledEditor />)
    fireEvent.click(screen.getByRole('tab', { name: 'JSON' }))
    fireEvent.input(screen.getByRole('textbox', { name: 'Model Mapping' }), {
      target: { value: '{broken' },
    })
    expect(screen.getByRole('tab', { name: 'Visual' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('textbox', { name: 'Model Mapping' })).toHaveValue(
      '{broken'
    )
    fireEvent.input(screen.getByRole('textbox', { name: 'Model Mapping' }), {
      target: { value: '{"a":"b"}' },
    })
    fireEvent.click(screen.getByRole('tab', { name: 'Visual' }))
    expect(
      screen.getByRole('combobox', { name: 'Request Model Name' })
    ).toHaveValue('a')
    expect(
      screen.getByRole('combobox', { name: 'Upstream Model Name' })
    ).toHaveValue('b')
  })

  it('selects a searched model using the keyboard and keeps custom names', async () => {
    const user = userEvent.setup()
    render(
      <ModelMappingEditor
        value='{"public":""}'
        onChange={vi.fn()}
        targetModelOptions={['provider-one', 'provider-two']}
      />
    )
    // Invalid persisted values start in JSON so no data is silently repaired.
    fireEvent.input(screen.getByRole('textbox', { name: 'Model Mapping' }), {
      target: { value: '{"public":"custom"}' },
    })
    await user.click(screen.getByRole('tab', { name: 'Visual' }))
    const input = screen.getByRole('combobox', { name: 'Upstream Model Name' })
    await user.clear(input)
    await user.type(input, 'provider-t')
    await user.keyboard('{ArrowDown}{Enter}')
    expect(input).toHaveValue('provider-two')
  })

  it('keeps drafts isolated between independently mounted channel editors', () => {
    render(
      <>
        <section aria-label='First channel'>
          <ControlledEditor />
        </section>
        <section aria-label='Second channel'>
          <ControlledEditor />
        </section>
      </>
    )
    const first = within(screen.getByRole('region', { name: 'First channel' }))
    const second = within(
      screen.getByRole('region', { name: 'Second channel' })
    )
    fireEvent.click(first.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.click(second.getByRole('button', { name: 'Add Mapping' }))
    fireEvent.change(
      first.getByRole('combobox', { name: 'Request Model Name' }),
      { target: { value: 'first-alias' } }
    )
    expect(
      second.getByRole('combobox', { name: 'Request Model Name' })
    ).toHaveValue('')
    expect(
      first.getByRole('combobox', { name: 'Request Model Name' }).id
    ).not.toBe(second.getByRole('combobox', { name: 'Request Model Name' }).id)
  })

  it('disables every editing control when the owning form is saving', () => {
    render(<ModelMappingEditor value='{"a":"b"}' onChange={vi.fn()} disabled />)
    expect(
      screen.getByRole('combobox', { name: 'Request Model Name' })
    ).toBeDisabled()
    expect(
      screen.getByRole('combobox', { name: 'Upstream Model Name' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Mapping' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Delete mapping' })
    ).toBeDisabled()
  })
})
