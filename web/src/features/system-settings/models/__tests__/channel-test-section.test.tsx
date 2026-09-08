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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { UpdateOptionRequest } from '../../types'
import { ChannelTestSection } from '../channel-test-section'

const defaults: ComponentProps<typeof ChannelTestSection>['defaultValues'] = {
  AutomaticEnableChannelEnabled: false,
  'monitor_setting.channel_test_message': 'hi',
  'monitor_setting.channel_test_use_channel_style': true,
  'monitor_setting.channel_test_show_response_preview': false,
  'monitor_setting.auto_test_channel_enabled': false,
  'monitor_setting.auto_test_channel_minutes': 10,
  'monitor_setting.channel_test_mode': 'scheduled_all',
}

const previousAdapter = api.defaults.adapter
let client: QueryClient
let actions: HTMLDivElement
let updates: { url: string | undefined; body: UpdateOptionRequest }[]

beforeEach(() => {
  updates = []
  actions = document.createElement('div')
  document.body.append(actions)
  client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  api.defaults.adapter = async (config) => {
    updates.push({
      url: config.url,
      body: JSON.parse(String(config.data)) as UpdateOptionRequest,
    })
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { success: true },
    }
  }
})

afterEach(() => {
  cleanup()
  client.clear()
  actions.remove()
  api.defaults.adapter = previousAdapter
})

function renderSettings() {
  return render(
    <QueryClientProvider client={client}>
      <SettingsPageProvider actionsContainer={actions}>
        <ChannelTestSection defaultValues={defaults} />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

describe('channel test settings', () => {
  it('explains full response previews and separates capability checks from background health checks', () => {
    renderSettings()
    expect(
      screen.getByText(
        'Show the full, redacted response through the Preview button in test details. The response opens in a side panel with raw content collapsed by default.'
      )
    ).toBeDefined()
    expect(
      screen.getByText(
        'Default text for conversation checks. Image and tool tests use built-in prompts; the dialog can override the text for basic conversation and image tests.'
      )
    ).toBeDefined()
    expect(
      screen.getByText(
        'Background checks use one test model per channel to monitor connectivity. The four capability checks are selected separately in the channel test dialog.'
      )
    ).toBeDefined()
    expect(screen.queryByText(/small, truncated response preview/)).toBeNull()
    expect(
      screen
        .getByRole('switch', { name: 'Show response preview' })
        .getAttribute('aria-checked')
    ).toBe('false')
    expect(updates).toEqual([])
  })

  it('saves preview visibility and health check scope through the existing option keys', async () => {
    const user = userEvent.setup()
    renderSettings()
    await user.click(
      screen.getByRole('switch', { name: 'Show response preview' })
    )
    await user.click(
      screen.getByRole('combobox', { name: 'Health check scope' })
    )
    await user.click(
      screen.getByRole('option', { name: 'Auto-disabled channels only' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() =>
      expect(updates).toEqual([
        {
          url: '/api/option/',
          body: {
            key: 'monitor_setting.channel_test_show_response_preview',
            value: true,
          },
        },
        {
          url: '/api/option/',
          body: {
            key: 'monitor_setting.channel_test_mode',
            value: 'passive_recovery',
          },
        },
      ])
    )
    expect(
      screen.getByRole('textbox', { name: 'Default test message' }).textContent
    ).toBe('hi')
  })
})
