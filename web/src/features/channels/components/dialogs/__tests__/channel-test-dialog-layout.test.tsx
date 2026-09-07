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
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  channelTestApiFixture,
  renderChannelTest,
} from '../../../__tests__/channel-test-fixture'

let api: ReturnType<typeof channelTestApiFixture>
beforeEach(() => {
  api = channelTestApiFixture()
})
afterEach(async () => {
  cleanup()
  await api.finish()
  api.restore()
})

describe('channel test dialog layout', () => {
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
    renderChannelTest()
    const advanced = screen.getByRole('button', { name: 'Advanced settings' })
    expect(advanced.getAttribute('aria-expanded')).toBe('false')
    await act(async () => fireEvent.click(advanced))
    expect(advanced.getAttribute('aria-expanded')).toBe('true')
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
