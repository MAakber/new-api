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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDrawingStore } from '@/stores/drawing-store'

import { DrawingSettings } from '../components/DrawingSettings'
import { buildImagePayload } from '../lib/image-settings'

let client: QueryClient

beforeEach(() => {
  useDrawingStore.getState().initialize(941)
  useDrawingStore.getState().hydrate(null)
  useDrawingStore.getState().updateSettings({
    model: 'gpt-image-1',
    prompt: 'A quiet coastline',
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(
    ['drawing-groups', 941],
    [
      { value: 'default', label: 'Standard', ratio: 1 },
      { value: 'illustration', label: 'Illustration', ratio: 1 },
    ]
  )
  client.setQueryData(
    ['drawing-models', 941, 'default'],
    ['gpt-image-1', 'gpt-image-2'].map((value) => ({ value, label: value }))
  )
  client.setQueryData(
    ['drawing-models', 941, 'illustration'],
    [{ value: 'dall-e-3', label: 'dall-e-3' }]
  )
})

afterEach(() => client.clear())

function renderSettings() {
  const onGenerate = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <DrawingSettings
        userId={941}
        pendingCount={0}
        onGenerate={onGenerate}
        onCancel={vi.fn()}
        onUploadReferences={vi.fn()}
        onMaskUpload={vi.fn()}
        onClearMask={vi.fn()}
        onDrawMask={vi.fn()}
      />
    </QueryClientProvider>
  )
  return { user: userEvent.setup(), onGenerate }
}

describe('Drawing settings selection', () => {
  it('opens the quality menu, selects by keyboard, and submits the saved choice', async () => {
    const { user, onGenerate } = renderSettings()
    const quality = screen.getByRole('combobox', { name: 'Quality' })
    await user.click(quality)
    expect(quality).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(screen.getByRole('listbox')).getByRole('option', { name: 'Auto' })
    ).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{End}{Enter}')
    await waitFor(() => expect(quality).toHaveTextContent('High'))
    expect(quality).toHaveFocus()
    expect(quality).toHaveAttribute('aria-expanded', 'false')
    expect(useDrawingStore.getState().settings.quality).toBe('high')
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(buildImagePayload(onGenerate.mock.calls[0][0]).quality).toBe('high')
  })

  it('updates dependent compression controls and the request when choosing JPEG', async () => {
    const { user, onGenerate } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Advanced settings' }))
    expect(
      screen.queryByRole('spinbutton', { name: 'Output compression' })
    ).not.toBeInTheDocument()
    const format = screen.getByRole('combobox', { name: 'Output format' })
    await user.click(format)
    expect(format).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('option', { name: 'JPEG' }))
    expect(
      screen.getByRole('spinbutton', { name: 'Output compression' })
    ).toBeVisible()
    expect(useDrawingStore.getState().settings.outputFormat).toBe('jpeg')
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(buildImagePayload(onGenerate.mock.calls[0][0]).output_format).toBe(
      'jpeg'
    )
  })

  it('switches groups, selects a compatible model, and disables unsupported image editing', async () => {
    useDrawingStore.getState().updateSettings({
      mode: 'edit',
      n: 3,
      size: '1536x1024',
    })
    const { user } = renderSettings()
    const group = screen.getByRole('combobox', { name: 'Group' })
    await user.click(group)
    expect(group).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('option', { name: 'Illustration' }))
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue(
        'dall-e-3'
      )
    )
    expect(useDrawingStore.getState().settings).toMatchObject({
      group: 'illustration',
      model: 'dall-e-3',
      mode: 'generate',
      n: 1,
      quality: 'standard',
      size: '1024x1024',
    })
    const mode = screen.getByRole('combobox', { name: 'Mode' })
    await user.click(mode)
    expect(
      screen.getByRole('option', { name: 'Image editing' })
    ).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Escape}')
    expect(mode).toHaveFocus()
    expect(mode).toHaveTextContent('Text to image')
  })

  it('opens model suggestions and applies the selected model to the form', async () => {
    const { user, onGenerate } = renderSettings()
    const model = screen.getByRole('combobox', { name: 'Model' })
    await user.click(model)
    expect(model).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('option', { name: 'gpt-image-2' }))
    expect(model).toHaveValue('gpt-image-2')
    expect(model).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(buildImagePayload(onGenerate.mock.calls[0][0]).model).toBe(
      'gpt-image-2'
    )
  })

  it('accepts a custom model without submitting when Enter confirms the entry', async () => {
    const { user, onGenerate } = renderSettings()
    const model = screen.getByRole('combobox', { name: 'Model' })
    await user.click(model)
    await user.keyboard('{Control>}a{/Control}')
    await user.paste('custom-image-model')
    await user.keyboard('{Enter}')
    expect(model).toHaveValue('custom-image-model')
    expect(model).toHaveAttribute('aria-expanded', 'false')
    expect(onGenerate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(buildImagePayload(onGenerate.mock.calls[0][0]).model).toBe(
      'custom-image-model'
    )
  })

  it('shows choices restored from saved settings and keeps them when Escape closes a menu', async () => {
    const { user } = renderSettings()
    act(() =>
      useDrawingStore.getState().updateSettings({
        quality: 'low',
        outputFormat: 'webp',
      })
    )
    const quality = screen.getByRole('combobox', { name: 'Quality' })
    expect(quality).toHaveTextContent('Low')
    expect(
      screen.getByRole('combobox', { name: 'Output format' })
    ).toHaveTextContent('WebP')
    await user.click(quality)
    expect(quality).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{End}{Escape}')
    expect(quality).toHaveTextContent('Low')
    expect(quality).toHaveFocus()
    expect(useDrawingStore.getState().settings.quality).toBe('low')
  })
})
