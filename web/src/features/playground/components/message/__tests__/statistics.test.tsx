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
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { afterEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'

import type { Message } from '../../../types'
import { MessageMetadata } from '../message-metadata'

afterEach(async () => {
  await i18next.changeLanguage('en')
  i18next.removeResourceBundle('zhCN', 'translation')
  i18next.removeResourceBundle('zhTW', 'translation')
})

describe('Message statistics', () => {
  it.each(['zhCN', 'zhTW'])(
    'formats tokens for the project language code %s without crashing',
    async (language) => {
      i18next.addResourceBundle(language, 'translation', {
        'Message statistics': 'Message statistics',
      })
      await i18next.changeLanguage(language)
      const message: Message = {
        key: 'a',
        from: 'assistant',
        versions: [{ id: 'v1', content: 'Answer' }],
        run: {
          run_id: 'r1',
          search_mode: 'off',
          parts: [],
          tool_calls: [],
          usage: { input_tokens: 2140 },
        },
      }
      render(
        <TooltipProvider>
          <MessageMetadata alignment='left' message={message} />
        </TooltipProvider>
      )
      expect(
        screen.getByRole('button', { name: 'Message statistics' })
      ).toHaveTextContent('2,140')
    }
  )

  it('opens details with the keyboard, preserves reported zero and labels missing usage', async () => {
    const user = userEvent.setup()
    const message: Message = {
      key: 'a',
      from: 'assistant',
      versions: [{ id: 'v1', content: 'Answer' }],
      durationMs: 12400,
      run: {
        run_id: 'r1',
        search_mode: 'mcp',
        parts: [],
        tool_calls: [],
        usage: { input_tokens: 2140, output_tokens: 386, cached_tokens: 0 },
      },
    }
    render(
      <TooltipProvider>
        <MessageMetadata alignment='left' message={message} />
      </TooltipProvider>
    )
    const button = screen.getByRole('button', { name: 'Message statistics' })
    expect(button).toHaveTextContent('2,140')
    expect(button).toHaveTextContent('Cached tokens: 0')
    await user.tab()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(screen.getByText('Cache write tokens')).toBeVisible()
    expect(screen.getByText('Not reported')).toBeVisible()
    expect(
      screen.getByText(
        'Cached tokens are part of input tokens. Reasoning tokens are part of output tokens. Missing values are not reported by the provider.'
      )
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(button).toHaveFocus()
  })
})
