import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDrawingStore } from '@/stores/drawing-store'

import { DrawingSettings } from '../components/DrawingSettings'
import { buildImagePayload } from '../lib/image-settings'

let client: QueryClient

beforeEach(() => {
  useDrawingStore.getState().initialize(931)
  useDrawingStore.getState().hydrate(null)
  useDrawingStore.getState().updateSettings({
    model: 'gpt-image-2',
    prompt: 'A quiet coastline',
  })
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(
    ['drawing-groups', 931],
    [{ value: 'default', label: 'default', ratio: 1 }]
  )
  client.setQueryData(
    ['drawing-models', 931, 'default'],
    [{ value: 'gpt-image-2', label: 'gpt-image-2' }]
  )
})

afterEach(() => client.clear())

function renderSettings() {
  const onGenerate = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <DrawingSettings
        userId={931}
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

describe('Image size controls', () => {
  it('submits the chosen ratio and resolution and updates the saved canvas settings', async () => {
    const { user, onGenerate } = renderSettings()
    const ratios = within(screen.getByRole('group', { name: 'Aspect ratio' }))
    const resolutions = within(
      screen.getByRole('group', { name: 'Resolution' })
    )
    expect(ratios.getByRole('button', { name: '1:1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(
      screen.queryByRole('textbox', { name: 'Image size' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('spinbutton', { name: 'Width (px)' })
    ).not.toBeInTheDocument()
    await user.click(ratios.getByRole('button', { name: '16:9' }))
    await user.click(resolutions.getByRole('button', { name: '2K' }))
    expect(screen.getByText('Output size: 2048 × 1152 px')).toBeInTheDocument()
    expect(useDrawingStore.getState().settings.size).toBe('2048x1152')
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(buildImagePayload(onGenerate.mock.calls[0][0]).size).toBe(
      '2048x1152'
    )
  })

  it('keeps automatic size selected and disables concrete resolutions until a ratio is chosen', async () => {
    const { user } = renderSettings()
    const ratios = within(screen.getByRole('group', { name: 'Aspect ratio' }))
    const resolutions = within(
      screen.getByRole('group', { name: 'Resolution' })
    )
    const automatic = ratios.getByRole('button', { name: 'Auto' })
    await user.click(automatic)
    await user.click(automatic)
    expect(automatic).toHaveAttribute('aria-pressed', 'true')
    expect(useDrawingStore.getState().settings.size).toBe('auto')
    for (const name of ['1K', '2K', '4K']) {
      expect(resolutions.getByRole('button', { name })).toBeDisabled()
    }
    await user.click(resolutions.getByRole('button', { name: 'Custom' }))
    expect(screen.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(
      1024
    )
    expect(useDrawingStore.getState().settings.size).toBe('1024x1024')
  })

  it('uses a supported resolution when changing away from a 4K widescreen ratio', async () => {
    const { user } = renderSettings()
    const ratios = within(screen.getByRole('group', { name: 'Aspect ratio' }))
    const resolutions = within(
      screen.getByRole('group', { name: 'Resolution' })
    )
    expect(resolutions.getByRole('button', { name: '4K' })).toBeDisabled()
    await user.click(ratios.getByRole('button', { name: '16:9' }))
    await user.click(resolutions.getByRole('button', { name: '4K' }))
    expect(useDrawingStore.getState().settings.size).toBe('3840x2160')
    await user.click(ratios.getByRole('button', { name: '1:1' }))
    expect(useDrawingStore.getState().settings.size).toBe('2048x2048')
    expect(resolutions.getByRole('button', { name: '2K' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(resolutions.getByRole('button', { name: '4K' })).toBeDisabled()
  })

  it('edits custom dimensions, reports invalid sizes, and submits the corrected values', async () => {
    const { user, onGenerate } = renderSettings()
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const width = screen.getByRole('spinbutton', { name: 'Width (px)' })
    const height = screen.getByRole('spinbutton', { name: 'Height (px)' })
    await user.clear(width)
    await user.type(width, '1537')
    expect(width).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('multiples of 16')
    await user.clear(width)
    await user.type(width, '1536')
    await user.clear(height)
    await user.type(height, '864')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(useDrawingStore.getState().settings.size).toBe('1536x864')
    await user.click(screen.getByRole('button', { name: 'Generate images' }))
    await waitFor(() => expect(onGenerate).toHaveBeenCalledOnce())
    expect(onGenerate.mock.calls[0][0].size).toBe('1536x864')
  })

  it('restores custom sizes and resets to compatible options when the model changes', async () => {
    useDrawingStore.getState().updateSettings({ size: '1536x864' })
    renderSettings()
    expect(screen.getByRole('spinbutton', { name: 'Width (px)' })).toHaveValue(
      1536
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'gpt-image-1' },
    })
    expect(useDrawingStore.getState().settings.size).toBe('1024x1024')
    expect(
      screen.queryByRole('button', { name: 'Custom' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '16:9' })
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2:3' }))
    expect(useDrawingStore.getState().settings.size).toBe('1024x1536')
    expect(screen.getByRole('button', { name: '1536 px' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Model' }), {
      target: { value: 'dall-e-3' },
    })
    fireEvent.click(screen.getByRole('button', { name: '7:4' }))
    expect(useDrawingStore.getState().settings.size).toBe('1792x1024')
  })

  it('supports keyboard selection and reflects settings restored while the panel is mounted', async () => {
    const { user } = renderSettings()
    const square = screen.getByRole('button', { name: '1:1' })
    act(() => square.focus())
    await user.keyboard('{ArrowRight} ')
    expect(screen.getByRole('button', { name: '2:3' })).toHaveFocus()
    expect(useDrawingStore.getState().settings.size).toBe('672x1008')
    act(() => useDrawingStore.getState().updateSettings({ size: '2048x1152' }))
    expect(screen.getByRole('button', { name: '16:9' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: '2K' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
