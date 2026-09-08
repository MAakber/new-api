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
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Window as HappyDOMWindow } from 'happy-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  channelTestApiFixture,
  renderChannelTest,
} from '../../../__tests__/channel-test-fixture'

let api: ReturnType<typeof channelTestApiFixture>
const domWindow = window as unknown as HappyDOMWindow
beforeEach(() => {
  domWindow.happyDOM.setWindowSize({ width: 1024, height: 768 })
  api = channelTestApiFixture()
})
afterEach(async () => {
  cleanup()
  await api.finish()
  api.restore()
  domWindow.happyDOM.setWindowSize({ width: 1024, height: 768 })
})

describe('channel test dialog layout', () => {
  it('collapses mobile capabilities by default and keeps selections when expanded with the keyboard', async () => {
    domWindow.happyDOM.setWindowSize({ width: 390, height: 844 })
    const user = userEvent.setup()
    renderChannelTest()
    const toggle = screen.getByRole('button', { name: /^Test capabilities/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('4 / 4 selected')
    expect(
      screen.queryByRole('group', { name: 'Test capabilities' })
    ).toBeNull()
    expect(screen.getByText('Estimated requests: 4')).toBeDefined()

    await waitFor(() =>
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(
        true
      )
    )
    toggle.focus()
    await user.keyboard('[Enter]')
    const capabilities = screen.getByRole('group', {
      name: 'Test capabilities',
    })
    expect(within(capabilities).getAllByRole('checkbox')).toHaveLength(4)
    await user.click(
      within(capabilities).getByRole('checkbox', {
        name: 'Tools · non-streaming',
      })
    )
    expect(screen.getByText('Estimated requests: 3')).toBeDefined()
    await user.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('3 / 4 selected')
    await user.keyboard(' ')
    expect(
      screen
        .getByRole('checkbox', { name: 'Tools · non-streaming' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(api.requests).toHaveLength(0)
  })

  it('keeps desktop capabilities visible and preserves selections across the mobile breakpoint', async () => {
    const user = userEvent.setup()
    const matchMedia = window.matchMedia.bind(window)
    const mediaQueries = new Set<MediaQueryList>()
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const media = matchMedia(query)
      if (query === '(max-width: 767px)') mediaQueries.add(media)
      return media
    })
    renderChannelTest()
    expect(
      screen.queryByRole('button', { name: /^Test capabilities/ })
    ).toBeNull()
    await user.click(screen.getByRole('checkbox', { name: 'Streaming' }))
    await act(async () =>
      domWindow.happyDOM.setWindowSize({ width: 390, height: 844 })
    )
    const toggle = screen.getByRole('button', { name: /^Test capabilities/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.textContent).toContain('3 / 4 selected')
    await act(async () => {
      domWindow.happyDOM.setWindowSize({ width: 1024, height: 768 })
      // Happy DOM misses matched-to-unmatched events after a new subscription.
      for (const media of mediaQueries) media.dispatchEvent(new Event('change'))
    })
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^Test capabilities/ })
      ).toBeNull()
    )
    expect(
      screen
        .getByRole('checkbox', { name: 'Streaming' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(api.requests).toHaveLength(0)
  })

  it('opens without requests, offers four capabilities and puts scrolling results between fixed controls', () => {
    renderChannelTest([
      'provider/very-long-model-name-that-wraps-without-breaking-the-result-columns',
      'gpt-image-2',
    ])
    expect(api.requests).toHaveLength(0)
    const capabilities = screen.getByRole('group', {
      name: 'Test capabilities',
    })
    expect(within(capabilities).getAllByRole('checkbox')).toHaveLength(4)
    for (const checkbox of within(capabilities).getAllByRole('checkbox')) {
      expect(checkbox.getAttribute('aria-checked')).toBe('true')
    }

    const content = screen.getByRole('dialog', {
      name: /Test Channel Connection/,
    })
    expect(content.classList.contains('h-dvh')).toBe(true)
    expect(content.classList.contains('md:max-w-[1280px]')).toBe(true)
    expect(content.classList.contains('md:max-h-[90dvh]')).toBe(true)
    expect(content.classList.contains('overflow-hidden')).toBe(true)
    const table = screen.getByRole('region', { name: 'Channel models' })
    expect(table.classList.contains('max-md:hidden')).toBe(true)
    expect(within(table).getAllByRole('columnheader')).toHaveLength(5)
    const mobile = document.querySelector(
      '[data-slot="mobile-channel-model-list"]'
    ) as HTMLElement
    expect(mobile.classList.contains('overflow-y-auto')).toBe(true)
    expect(mobile.classList.contains('md:hidden')).toBe(true)
    const cards = mobile.querySelectorAll<HTMLElement>('article')
    expect(cards).toHaveLength(2)
    for (const card of cards) {
      expect(within(card).getAllByRole('button', { name: / · / })).toHaveLength(
        4
      )
    }
    expect(
      within(cards[1] as HTMLElement).getAllByRole('button', {
        name: /Not applicable/,
      })
    ).toHaveLength(2)
    expect(
      content
        .querySelector('[data-slot="dialog-footer"]')
        ?.classList.contains('shrink-0')
    ).toBe(true)
    expect(screen.getByText('Estimated requests: 6')).toBeDefined()
  })

  it('exposes advanced settings and keeps them keyboard accessible without launching probes', async () => {
    domWindow.happyDOM.setWindowSize({ width: 390, height: 844 })
    renderChannelTest()
    const advanced = screen.getByRole('button', { name: 'Advanced settings' })
    expect(advanced.getAttribute('aria-expanded')).toBe('false')
    await act(async () => fireEvent.click(advanced))
    expect(advanced.getAttribute('aria-expanded')).toBe('true')
    expect(
      screen
        .getByRole('button', { name: /^Test capabilities/ })
        .getAttribute('aria-expanded')
    ).toBe('false')
    expect(
      screen.getByRole('textbox', { name: 'Test message override' })
    ).toBeDefined()
    expect(
      screen.getByText(
        'Checks the tool name and complete arguments. No tool is executed and no result is sent back.'
      )
    ).toBeDefined()
    expect(api.requests).toHaveLength(0)
  })
})
