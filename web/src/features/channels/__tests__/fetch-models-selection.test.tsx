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
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { renderPicker } from './fetch-models-fixtures'

describe('fetch models filtering and selection', () => {
  it('groups fetched Grok models under xAI instead of Other', async () => {
    renderPicker({
      customFetcher: async () => ['grok-4', 'grok-imagine-image'],
    })
    await screen.findByRole('checkbox', { name: 'grok-4' })
    expect(screen.queryByText('xAI')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /^Other\s*\d/ })).toBeNull()
  })

  it('unions selected types, combines search, and counts each model once', async () => {
    const user = userEvent.setup()
    const customFetcher = vi.fn(async () => [
      'grok-4',
      'grok-imagine-image',
      'grok-imagine-video',
      'gemini-3-pro-image',
      'grok-imagine-image',
    ])
    renderPicker({ customFetcher })
    await screen.findByRole('checkbox', { name: 'grok-4' })

    await user.click(
      screen.getByRole('button', { name: 'Image generation: 2 models' })
    )
    expect(screen.queryByRole('checkbox', { name: 'grok-4' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Chat: 2 models' })
    ).not.toBeNull()
    expect(screen.getByRole('button', { name: 'All: 4 models' })).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Video: 1 models' }))
    expect(
      screen.getByRole('checkbox', { name: 'grok-imagine-video' })
    ).not.toBeNull()
    expect(
      screen.getByRole('checkbox', { name: 'grok-imagine-image' })
    ).not.toBeNull()
    expect(
      screen.getAllByRole('checkbox', { name: 'gemini-3-pro-image' })
    ).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Chat: 2 models' }))
    expect(
      screen.getAllByRole('checkbox', { name: 'gemini-3-pro-image' })
    ).toHaveLength(1)
    expect(screen.getByRole('checkbox', { name: 'grok-4' })).not.toBeNull()

    await user.type(
      screen.getByRole('textbox', { name: 'Search models' }),
      'grok'
    )
    expect(
      screen.queryByRole('checkbox', { name: 'gemini-3-pro-image' })
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Image generation: 1 models' })
    ).not.toBeNull()
    expect(customFetcher).toHaveBeenCalledTimes(1)
  })

  it('limits vendor selection to visible models and saves hidden selections too', async () => {
    const user = userEvent.setup()
    const onModelsSelected = vi.fn()
    renderPicker({
      customFetcher: async () => [
        'grok-4',
        'grok-imagine-image',
        'grok-imagine-video',
      ],
      existingModelsOverride: ['grok-4'],
      onModelsSelected,
    })
    await screen.findByRole('checkbox', { name: 'grok-imagine-image' })
    await user.click(
      screen.getByRole('button', { name: 'Image generation: 1 models' })
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select visible xAI models' })
    )
    await user.click(screen.getByRole('button', { name: 'All: 2 models' }))
    expect(
      screen
        .getByRole('checkbox', { name: 'Select visible xAI models' })
        .getAttribute('aria-checked')
    ).toBe('mixed')

    await user.click(
      screen.getByRole('checkbox', { name: 'Select visible xAI models' })
    )
    await user.click(
      screen.getByRole('button', { name: 'Image generation: 1 models' })
    )
    await user.click(
      screen.getByRole('checkbox', { name: 'Select visible xAI models' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Models' }))

    expect(onModelsSelected).toHaveBeenCalledExactlyOnceWith([
      'grok-4',
      'grok-imagine-video',
    ])
  })

  it('keeps the active status tab when filters hide every result', async () => {
    const user = userEvent.setup()
    renderPicker({
      customFetcher: async () => ['grok-4', 'qwen3'],
      existingModelsOverride: ['grok-4'],
    })
    await screen.findByRole('checkbox', { name: 'qwen3' })
    await user.click(screen.getByRole('tab', { name: 'Existing Models (1)' }))
    await user.click(
      screen.getByRole('button', { name: 'Image generation: 0 models' })
    )
    expect(
      screen
        .getByRole('tab', { name: 'Existing Models (0)' })
        .getAttribute('aria-selected')
    ).toBe('true')
    expect(screen.getByText('No models match these filters.')).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'All: 1 models' }))
    expect(
      screen
        .getByRole('tab', { name: 'Existing Models (1)' })
        .getAttribute('aria-selected')
    ).toBe('true')
    expect(
      screen
        .getByRole('checkbox', { name: 'grok-4' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('keeps removed entries reversible and excludes redirect source aliases', async () => {
    const user = userEvent.setup()
    renderPicker({
      customFetcher: async () => ['grok-4'],
      existingModelsOverride: ['grok-4', 'old-model', 'redirect-alias'],
      redirectSourceModels: ['redirect-alias'],
    })
    const removed = await screen.findByRole('checkbox', { name: 'old-model' })
    expect(
      screen.queryByRole('checkbox', { name: 'redirect-alias' })
    ).toBeNull()
    await user.click(removed)
    expect(
      screen
        .getByRole('checkbox', { name: 'old-model' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(
      screen
        .getByRole('tab', { name: 'Removed Models (1)' })
        .getAttribute('aria-selected')
    ).toBe('true')
    await user.click(screen.getByRole('checkbox', { name: 'old-model' }))
    expect(
      screen
        .getByRole('checkbox', { name: 'old-model' })
        .getAttribute('aria-checked')
    ).toBe('true')
  })

  it('keeps vendor selection separate from collapsing and supports keyboard type toggles', async () => {
    const user = userEvent.setup()
    renderPicker({
      customFetcher: async () => ['grok-4', 'grok-imagine-image'],
    })
    await screen.findByRole('checkbox', { name: 'grok-4' })
    const header = screen.getByRole('button', { name: /^xAI\s*\d/ })
    await user.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    await user.click(
      screen.getByRole('checkbox', { name: 'Select visible xAI models' })
    )
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(
      screen
        .getByRole('checkbox', { name: 'Select visible xAI models' })
        .getAttribute('aria-checked')
    ).toBe('true')

    const imageType = screen.getByRole('button', {
      name: 'Image generation: 1 models',
    })
    imageType.focus()
    await user.keyboard(' ')
    expect(imageType.getAttribute('aria-pressed')).toBe('true')
    await user.keyboard(' ')
    expect(
      screen
        .getByRole('button', { name: 'All: 2 models' })
        .getAttribute('aria-pressed')
    ).toBe('true')
    expect(within(header).queryByRole('checkbox')).toBeNull()
  })
})
