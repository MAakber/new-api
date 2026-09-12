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
import { ReactFlowProvider } from '@xyflow/react'
import type { Window as HappyDOMWindow } from 'happy-dom'
import i18next, { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, it, expect, vi } from 'vitest'

import zhTW from '@/i18n/locales/zh-TW.json'
import zhCN from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { useDrawingStore } from '@/stores/drawing-store'

import { DrawingWorkspace } from '../components/DrawingWorkspace'
import { saveGalleryImage } from '../lib/gallery-storage'
import { DEFAULT_IMAGE_SETTINGS } from '../lib/image-settings'
import type { ImageNodeData } from '../types'

const browser = window as unknown as HappyDOMWindow
const savedImage = {
  asset: {
    id: 'gallery-cup',
    name: 'cup.png',
    src: 'data:image/png;base64,YWJj',
    mimeType: 'image/png',
    width: 512,
    height: 512,
  },
  prompt: 'A ceramic cup',
  settings: {
    ...DEFAULT_IMAGE_SETTINGS,
    prompt: 'A ceramic cup',
    model: 'gpt-image-1',
  },
  origin: 'generated',
  status: 'complete',
  createdAt: 1000,
} satisfies ImageNodeData

afterEach(() => browser.happyDOM.setWindowSize({ width: 1024, height: 768 }))

function renderWorkspace(userId: number, i18n = i18next) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(
    ['drawing-groups', userId],
    [{ value: 'default', label: 'default', ratio: 1 }]
  )
  client.setQueryData(
    ['drawing-models', userId, 'default'],
    [{ value: 'gpt-image-1', label: 'gpt-image-1' }]
  )
  const view = render(
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <ReactFlowProvider initialWidth={1000} initialHeight={700}>
          <DrawingWorkspace userId={userId} />
        </ReactFlowProvider>
      </QueryClientProvider>
    </I18nextProvider>
  )
  return { client, view }
}

describe('Drawing workspace', () => {
  it.each([
    { language: 'zhCN', resources: zhCN, userId: 836 },
    { language: 'zhTW', resources: zhTW, userId: 837 },
  ])(
    'opens a saved image preview when the interface language is $language',
    async ({ language, resources, userId }) => {
      browser.happyDOM.setWindowSize({ width: 1440, height: 900 })
      await saveGalleryImage(userId, savedImage)
      const i18n = createInstance()
      await i18n.init({
        lng: language,
        resources: { [language]: resources },
        interpolation: { escapeValue: false },
      })
      const user = userEvent.setup()
      const { client, view } = renderWorkspace(userId, i18n)
      try {
        await user.click(
          await screen.findByRole('button', {
            name: i18n.t('Preview {{name}}', { name: savedImage.prompt }),
          })
        )
        const preview = await screen.findByRole('dialog', {
          name: i18n.t('Image preview'),
        })
        expect(preview).toBeVisible()
        await waitFor(() =>
          expect(
            within(preview).getByRole('button', {
              name: i18n.t('Add to canvas'),
            })
          ).toBeEnabled()
        )
        expect(
          within(preview).getByRole('img', { name: savedImage.prompt })
        ).toBeVisible()
      } finally {
        view.unmount()
        client.clear()
      }
    }
  )

  it('keeps a long preview prompt in a keyboard-accessible scroll area', async () => {
    browser.happyDOM.setWindowSize({ width: 1440, height: 900 })
    await saveGalleryImage(835, {
      ...savedImage,
      prompt: 'A very long image description. '.repeat(100),
    })
    const user = userEvent.setup()
    const { client, view } = renderWorkspace(835)
    await user.click(
      await screen.findByRole('button', {
        name: /^Preview A very long image description/,
      })
    )
    const prompt = screen.getByRole('region', { name: 'Prompt' })
    expect(prompt).toHaveClass('max-h-24', 'overflow-y-auto')
    prompt.focus()
    expect(prompt).toHaveFocus()
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add to canvas' })
      ).toBeEnabled()
    )
    view.unmount()
    client.clear()
  })
  it('collapses the desktop gallery, returns focus to its control and reopens by keyboard', async () => {
    browser.happyDOM.setWindowSize({ width: 1440, height: 900 })
    const user = userEvent.setup()
    const { client, view } = renderWorkspace(831)
    await screen.findByRole('complementary', { name: 'Gallery panel' })
    const toggle = screen.getByRole('button', { name: 'Gallery' })
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('complementary', { name: 'Gallery panel' })
    ).toHaveClass('w-72', 'shrink-0')
    await user.click(screen.getByRole('button', { name: 'Close gallery' }))
    expect(
      screen.queryByRole('complementary', { name: 'Gallery panel' })
    ).toBeNull()
    expect(toggle).toHaveFocus()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.keyboard('{Enter}')
    expect(
      screen.getByRole('complementary', { name: 'Gallery panel' })
    ).toBeVisible()
    view.unmount()
    client.clear()
  })

  it('opens the gallery in a right drawer on a narrow screen and restores focus on Escape', async () => {
    browser.happyDOM.setWindowSize({ width: 390, height: 844 })
    const user = userEvent.setup()
    const { client, view } = renderWorkspace(832)
    const toggle = await screen.findByRole('button', { name: 'Gallery' })
    expect(
      screen.getByRole('toolbar', { name: 'Canvas tools' })
    ).not.toHaveClass('overflow-x-auto')
    expect(
      screen.queryByRole('complementary', { name: 'Gallery panel' })
    ).toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    const drawer = await screen.findByRole('dialog', { name: 'Image gallery' })
    expect(drawer).toHaveAttribute('data-side', 'right')
    expect(
      within(drawer).getByRole('button', { name: 'Close gallery' })
    ).toBeVisible()
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Image gallery' })).toBeNull()
    )
    await waitFor(() => expect(toggle).toHaveFocus())
    view.unmount()
    client.clear()
  })

  it('restores a saved work after clearing the canvas and reuses it as a reference without duplicating it', async () => {
    browser.happyDOM.setWindowSize({ width: 1440, height: 900 })
    await saveGalleryImage(833, savedImage)
    const user = userEvent.setup()
    const { client, view } = renderWorkspace(833)
    await user.click(
      await screen.findByRole('button', { name: 'Preview A ceramic cup' })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add to canvas' })
      ).toBeEnabled()
    )
    await user.click(screen.getByRole('button', { name: 'Add to canvas' }))
    await screen.findByRole('article', { name: 'A ceramic cup' })
    await user.click(screen.getByRole('button', { name: 'Clear canvas' }))
    await user.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('Room for every idea')
    await user.click(
      screen.getByRole('button', { name: 'Preview A ceramic cup' })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add to canvas' })
      ).toBeEnabled()
    )
    await user.click(screen.getByRole('button', { name: 'Add to canvas' }))
    await screen.findByRole('article', { name: 'A ceramic cup' })
    await user.click(
      screen.getByRole('button', { name: 'Preview A ceramic cup' })
    )
    const preview = await screen.findByRole('dialog', { name: 'Image preview' })
    await waitFor(() =>
      expect(
        within(preview).getByRole('button', { name: 'Use as reference' })
      ).toBeEnabled()
    )
    await user.click(
      within(preview).getByRole('button', { name: 'Use as reference' })
    )
    expect(
      screen.getAllByRole('article', { name: 'A ceramic cup' })
    ).toHaveLength(1)
    expect(
      screen.getByRole('button', { name: 'Reference selected' })
    ).toBeVisible()
    view.unmount()
    client.clear()
  })

  it('requires confirmation to delete a saved work and keeps its canvas image', async () => {
    browser.happyDOM.setWindowSize({ width: 1440, height: 900 })
    await saveGalleryImage(834, savedImage)
    const user = userEvent.setup()
    const { client, view } = renderWorkspace(834)
    await user.click(
      await screen.findByRole('button', { name: 'Preview A ceramic cup' })
    )
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add to canvas' })
      ).toBeEnabled()
    )
    await user.click(screen.getByRole('button', { name: 'Add to canvas' }))
    await user.click(
      screen.getByRole('button', { name: 'Preview A ceramic cup' })
    )
    await user.click(
      screen.getByRole('button', { name: 'Delete image from gallery' })
    )
    const confirmation = await screen.findByRole('alertdialog', {
      name: 'Delete image from gallery?',
    })
    await user.click(
      within(confirmation).getByRole('button', { name: 'Delete' })
    )
    await screen.findByText('No images yet')
    expect(screen.getByRole('article', { name: 'A ceramic cup' })).toBeVisible()
    view.unmount()
    client.clear()
  })
  it.each([
    { zoomButton: 'Zoom in', zoom: '120%', count: 1, userId: 851 },
    { zoomButton: 'Zoom out', zoom: '83%', count: 2, userId: 852 },
  ])(
    'keeps the $zoom canvas view when generating $count images after using $zoomButton',
    async ({ zoomButton, zoom, count, userId }) => {
      vi.spyOn(api, 'post').mockRejectedValue(
        new Error('Generation unavailable')
      )
      const user = userEvent.setup()
      const { client, view } = renderWorkspace(userId)
      try {
        await screen.findByText('Room for every idea')
        act(() =>
          useDrawingStore.getState().updateSettings({
            model: 'gpt-image-1',
            n: count,
          })
        )
        await user.type(
          screen.getByRole('textbox', { name: 'Prompt' }),
          'A cup'
        )
        await user.click(screen.getByRole('button', { name: zoomButton }))
        await waitFor(() =>
          expect(screen.getByLabelText('Zoom level').textContent).toBe(zoom)
        )
        const viewport = useDrawingStore.getState().viewport

        await user.click(
          screen.getByRole('button', { name: 'Generate images' })
        )
        await screen.findAllByText('Generation unavailable')
        // Happy DOM does not measure nodes; provide the canvas layout event.
        act(() =>
          useDrawingStore.getState().changeNodes(
            useDrawingStore.getState().nodes.map((node) => ({
              id: node.id,
              type: 'dimensions',
              dimensions: { width: 280, height: 330 },
            }))
          )
        )
        await act(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve())
              )
            })
        )

        expect(screen.getByLabelText('Zoom level').textContent).toBe(zoom)
        expect(useDrawingStore.getState().viewport).toEqual(viewport)
        expect(screen.getAllByRole('article', { name: 'A cup' })).toHaveLength(
          count
        )
      } finally {
        view.unmount()
        client.clear()
      }
    }
  )

  it('shows the empty canvas and settings when no reference image or mask exists', async () => {
    const { client, view } = renderWorkspace(801)
    await waitFor(() =>
      expect(screen.getByText('Room for every idea')).toBeTruthy()
    )
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toBeTruthy()
    expect(
      screen
        .getByRole('button', { name: 'Generate images' })
        .hasAttribute('disabled')
    ).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
    view.unmount()
    client.clear()
  })

  it('draws the minimap SVG at the size of its compact container after adding an image', async () => {
    const { client, view } = renderWorkspace(821)
    await waitFor(() =>
      expect(screen.getByText('Room for every idea')).toBeTruthy()
    )
    act(() =>
      useDrawingStore.getState().addNodes([
        {
          id: 'overview-image',
          type: 'image',
          position: { x: 0, y: 0 },
          width: 280,
          height: 330,
          data: {
            prompt: 'Overview image',
            settings: DEFAULT_IMAGE_SETTINGS,
            status: 'error',
            createdAt: 1,
          },
        },
      ])
    )
    const overview = screen.getByTestId('rf__minimap').querySelector('svg')
    expect(overview?.getAttribute('width')).toBe('144')
    expect(overview?.getAttribute('height')).toBe('96')
    expect(overview?.getAttribute('viewBox')).not.toContain('NaN')
    view.unmount()
    client.clear()
  })
})
