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
import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { assert, describe, expect, it, vi } from 'vitest'

import { useFetchModelPreferences } from '@/stores/fetch-model-preferences-store'

import { fetchUpstreamModels, updateChannel } from '../api'
import { FetchModelsDialog } from '../components/dialogs/fetch-models-dialog'
import type { Channel } from '../types'
import {
  deferredModelList,
  renderChannelUI,
  renderPicker,
} from './fetch-models-fixtures'

vi.mock('../api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api')>()),
  fetchUpstreamModels: vi.fn(),
  updateChannel: vi.fn(),
}))

describe('fetch models session lifecycle', () => {
  it('restores type preferences after reopening but resets search and unsaved model choices', async () => {
    const user = userEvent.setup()
    const picker = renderPicker({
      customFetcher: async () => [
        'grok-4',
        'grok-imagine-image',
        'grok-imagine-video',
      ],
      existingModelsOverride: ['grok-4'],
    })
    await screen.findByRole('checkbox', { name: 'grok-imagine-image' })
    await user.click(
      screen.getByRole('button', { name: 'Image generation: 1 models' })
    )
    await user.click(screen.getByRole('button', { name: 'Video: 1 models' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Search models' }),
      'image'
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'grok-imagine-image' })
    )

    picker.update({ open: false })
    picker.update({ open: true })
    await screen.findByRole('checkbox', { name: 'grok-imagine-image' })
    expect(
      screen
        .getByRole('button', { name: 'Image generation: 1 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Video: 1 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Search models',
        }) as HTMLInputElement
      ).value
    ).toBe('')
    expect(
      screen
        .getByRole('checkbox', { name: 'grok-imagine-image' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(screen.getByText('1 model(s) selected')).not.toBeNull()
  })

  it('retains a remembered type with no matches and lets All recover the list', async () => {
    useFetchModelPreferences.getState().setTypes(['embedding'])
    const user = userEvent.setup()
    renderPicker({ customFetcher: async () => ['grok-4'] })
    await screen.findByText('No models match these filters.')
    expect(
      screen
        .getByRole('button', { name: 'Embeddings: 0 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    await user.click(screen.getByRole('button', { name: 'All: 1 models' }))
    expect(screen.getByRole('checkbox', { name: 'grok-4' })).not.toBeNull()
    expect(useFetchModelPreferences.getState().types).toEqual([])
  })

  it('ignores a late fetch response after closing and reopening', async () => {
    const old = deferredModelList()
    const customFetcher = vi
      .fn<() => Promise<string[]>>()
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(['grok-4'])
    const picker = renderPicker({ customFetcher })
    await screen.findByRole('status', { name: 'Fetching models...' })
    picker.update({ open: false })
    picker.update({ open: true })
    await screen.findByRole('checkbox', { name: 'grok-4' })

    await act(async () => {
      old.resolve(['gpt-image-2'])
    })
    expect(screen.getByRole('checkbox', { name: 'grok-4' })).not.toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'gpt-image-2' })).toBeNull()
    expect(customFetcher).toHaveBeenCalledTimes(2)
  })

  it('shows fetch errors and retries only when requested without changing model selection', async () => {
    const user = userEvent.setup()
    const customFetcher = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error('Upstream unavailable'))
      .mockResolvedValueOnce(['grok-4'])
    renderPicker({ customFetcher, existingModelsOverride: ['grok-4'] })
    await screen.findByText('Upstream unavailable')
    expect(customFetcher).toHaveBeenCalledTimes(1)
    expect(
      screen
        .getByRole('button', { name: 'Save Models' })
        .hasAttribute('disabled')
    ).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      (await screen.findByRole('checkbox', { name: 'grok-4' })).getAttribute(
        'aria-checked'
      )
    ).toBe('true')
    expect(customFetcher).toHaveBeenCalledTimes(2)
  })

  it('shows an empty upstream result without claiming filters hid models', async () => {
    renderPicker({ customFetcher: async () => [] })
    await screen.findByText('No models fetched yet.')
    expect(screen.queryByText('No models match these filters.')).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Save Models' })
        .hasAttribute('disabled')
    ).toBe(true)
  })

  it('keeps open pickers independent while sharing defaults for newly opened channels', async () => {
    const user = userEvent.setup()
    const first = { id: 101, type: 1, name: 'First', models: '' } as Channel
    const second = { id: 202, type: 1, name: 'Second', models: '' } as Channel
    const onClose = vi.fn()
    vi.mocked(fetchUpstreamModels).mockImplementation(async (id) => ({
      success: true,
      data:
        id === 101
          ? ['grok-4', 'grok-imagine-image', 'grok-imagine-video']
          : ['gpt-image-2', 'sora-2'],
    }))
    vi.mocked(updateChannel).mockResolvedValue({ success: true })
    const view = renderChannelUI(
      <>
        <FetchModelsDialog open channel={first} onOpenChange={onClose} />
        <FetchModelsDialog
          open={false}
          channel={second}
          onOpenChange={onClose}
        />
      </>
    )
    await screen.findByRole('checkbox', { name: 'grok-4' })
    await user.click(
      screen.getByRole('button', { name: 'Image generation: 1 models' })
    )

    view.rerender(
      <>
        <FetchModelsDialog open channel={first} onOpenChange={onClose} />
        <FetchModelsDialog open channel={second} onOpenChange={onClose} />
      </>
    )
    await screen.findByRole('checkbox', { name: 'gpt-image-2' })
    const secondDialog = screen
      .getAllByRole('dialog')
      .find((dialog) => within(dialog).queryByText('Second'))
    assert(secondDialog)
    expect(
      within(secondDialog)
        .getByRole('button', { name: 'Image generation: 1 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Video: 1 models' })
    )
    await user.click(
      within(secondDialog).getByRole('checkbox', { name: 'gpt-image-2' })
    )
    await user.click(
      within(secondDialog).getByRole('button', { name: 'Save Models' })
    )
    await waitFor(() =>
      expect(updateChannel).toHaveBeenCalledWith(202, { models: 'gpt-image-2' })
    )

    view.rerender(
      <>
        <FetchModelsDialog open channel={first} onOpenChange={onClose} />
        <FetchModelsDialog
          open={false}
          channel={second}
          onOpenChange={onClose}
        />
      </>
    )
    expect(
      screen
        .getByRole('button', { name: 'Image generation: 1 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(
      screen
        .getByRole('button', { name: 'Video: 1 models' })
        .getAttribute('aria-pressed')
    ).toBe('false')
    expect(
      screen.queryByRole('checkbox', { name: 'grok-imagine-video' })
    ).toBeNull()
    expect(
      screen
        .getByRole('checkbox', { name: 'grok-imagine-image' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(fetchUpstreamModels).toHaveBeenCalledTimes(2)
    expect(fetchUpstreamModels).toHaveBeenCalledWith(101)
    expect(fetchUpstreamModels).toHaveBeenCalledWith(202)
    expect(useFetchModelPreferences.getState().types).toEqual([
      'image',
      'video',
    ])
  })
})
