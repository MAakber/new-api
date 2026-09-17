import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { assert, describe, expect, it } from 'vitest'

import {
  renderChannelUI,
  renderPicker,
} from '../../../__tests__/fetch-models-fixtures'
import { FetchModelsDialog } from '../fetch-models-dialog'

describe('fetch models dialog layout and focus', () => {
  it('keeps filters and actions outside the model scroll and wraps long model labels', async () => {
    const user = userEvent.setup()
    const modelName =
      'provider/very-long-model-name-that-must-wrap-without-horizontal-overflow'
    renderPicker({
      customFetcher: async () => [modelName, 'provider/second-model'],
    })
    await screen.findByRole('checkbox', { name: modelName })
    const content = screen.getByRole('dialog')
    const filters = content.querySelector<HTMLElement>(
      '[data-slot="fetch-models-filters"]'
    )
    const footer = content.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]'
    )
    assert(filters)
    assert(footer)
    const panel = screen.getByRole('tabpanel')

    expect(content.classList.contains('max-md:h-[100dvh]')).toBe(true)
    expect(content.classList.contains('overflow-hidden')).toBe(true)
    expect(panel.classList.contains('overflow-y-auto')).toBe(true)
    expect(panel.contains(filters)).toBe(false)
    expect(panel.contains(footer)).toBe(false)
    expect(
      footer.classList.contains(
        'max-md:pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]'
      )
    ).toBe(true)
    expect(footer.textContent).toContain('0 model(s) selected')
    expect(
      filters
        .querySelector('[data-slot="toggle-group"]')
        ?.parentElement?.classList.contains('overflow-x-auto')
    ).toBe(true)
    const label = screen.getByText(modelName, { selector: 'label' })
    expect(label.classList.contains('break-all')).toBe(true)
    await user.click(label)
    expect(
      screen
        .getByRole('checkbox', { name: modelName })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('closes with Escape and restores focus to the opener', async () => {
    const user = userEvent.setup()
    const customFetcher = async () => ['grok-4']
    function Launcher() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type='button' onClick={() => setOpen(true)}>
            Open model picker
          </button>
          <FetchModelsDialog
            open={open}
            onOpenChange={setOpen}
            customFetcher={customFetcher}
          />
        </>
      )
    }
    renderChannelUI(<Launcher />)
    const opener = screen.getByRole('button', { name: 'Open model picker' })
    await user.click(opener)
    await screen.findByRole('checkbox', { name: 'grok-4' })
    await user.click(screen.getByRole('textbox', { name: 'Search models' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(opener))
  })
})
