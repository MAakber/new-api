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
  'monitor_setting.channel_test_concurrency': 1,
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

function renderSettings(settings = defaults) {
  return render(
    <QueryClientProvider client={client}>
      <SettingsPageProvider actionsContainer={actions}>
        <ChannelTestSection defaultValues={settings} />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

describe('channel test settings', () => {
  it('saves concurrency independently and restores the saved limit', async () => {
    const user = userEvent.setup()
    const view = renderSettings()
    const input = screen.getByRole('spinbutton', {
      name: 'Channel test concurrency',
    })
    expect(input).toHaveValue(1)
    await user.clear(input)
    await user.type(input, '4')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(updates).toEqual([
        {
          url: '/api/option/',
          body: { key: 'monitor_setting.channel_test_concurrency', value: 4 },
        },
      ])
    )
    view.unmount()
    renderSettings({
      ...defaults,
      'monitor_setting.channel_test_concurrency': 4,
    })
    expect(
      screen.getByRole('spinbutton', { name: 'Channel test concurrency' })
    ).toHaveValue(4)
    expect(
      screen.getByRole('textbox', { name: 'Default test message' })
    ).toHaveValue('hi')
    expect(
      screen.getByRole('switch', { name: 'Use channel style' })
    ).toHaveAttribute('aria-checked', 'true')
  })

  it.each([
    ['0', 'Channel test concurrency must be between 1 and 32'],
    ['33', 'Channel test concurrency must be between 1 and 32'],
    ['1.5', 'Enter a positive integer'],
  ])(
    'rejects invalid concurrency %s without updating settings',
    async (value, message) => {
      const user = userEvent.setup()
      renderSettings()
      const input = screen.getByRole('spinbutton', {
        name: 'Channel test concurrency',
      })
      await user.clear(input)
      await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save Changes' }))
      expect(await screen.findByText(message)).toBeVisible()
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(updates).toEqual([])
    }
  )

  it('saves and restores auto-disable-enabled scope without changing other settings', async () => {
    const user = userEvent.setup()
    const view = renderSettings()
    await user.click(
      screen.getByRole('combobox', { name: 'Health check scope' })
    )
    await user.click(
      screen.getByRole('option', { name: 'Auto-disable-enabled channels only' })
    )
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() =>
      expect(updates).toEqual([
        {
          url: '/api/option/',
          body: {
            key: 'monitor_setting.channel_test_mode',
            value: 'auto_ban_only',
          },
        },
      ])
    )
    view.unmount()
    updates = []
    renderSettings({
      ...defaults,
      'monitor_setting.channel_test_mode': 'auto_ban_only',
    })
    expect(
      screen.getByRole('combobox', { name: 'Health check scope' }).textContent
    ).toContain('Auto-disable-enabled channels only')
    expect(
      screen.getByText(
        'Auto-disable-enabled mode probes non-manually-disabled channels with auto-disable enabled.'
      )
    ).toBeDefined()
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(updates).toEqual([])
  })

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
