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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'

import type { UsageLog } from '../../data/schema'
import type { LogOtherData } from '../../types'
import { DetailsDialog } from '../dialogs/details-dialog'

const log: UsageLog = {
  id: 1,
  user_id: 1,
  created_at: 1789363800,
  type: 2,
  content: 'Request completed',
  username: 'user',
  token_name: 'MAIN',
  model_name: 'gpt-test',
  quota: 5000,
  prompt_tokens: 1200,
  completion_tokens: 240,
  use_time: 24,
  is_stream: true,
  channel: 142,
  channel_name: 'Example channel',
  token_id: 1,
  group: 'default',
  ip: '192.0.2.10',
  other: '',
  request_id: 'request-with-a-long-identifier-012345678901234567890123456789',
  upstream_request_id: '',
}

const other: LogOtherData = {
  frt: 19800,
  model_ratio: 1,
  completion_ratio: 2,
  request_path: '/v1/responses',
  admin_info: {
    request_debug: {
      inbound: {
        method: 'POST',
        url: '/v1/responses',
        headers: { 'Content-Type': 'application/json', 'X-Trace': 'trace-1' },
        body: '{"input":"Only show this body when expanded"}',
        body_bytes: 48,
        body_bytes_known: true,
      },
      upstream: {
        method: 'POST',
        url: 'https://upstream.example/v1/responses',
        headers: { 'X-Upstream-Trace': 'upstream-trace' },
      },
      response: { status: 200, protocol: 'HTTP/2.0' },
    },
  },
}

const i18n = createInstance()
let client: QueryClient

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
  await i18n.init({
    lng: 'en',
    resources: { en },
    interpolation: { escapeValue: false },
  })
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const updatedAt = Date.now() + 60_000
  client.setQueryData(['status'], {}, { updatedAt })
  client.setQueryData(['pricing'], { data: [], vendors: [] }, { updatedAt })
})

afterEach(() => client.clear())

type DetailsFixtureProps = {
  other?: LogOtherData
  isAdmin?: boolean
  isRoot?: boolean
  log?: Partial<UsageLog>
}

function DetailsFixture(props: DetailsFixtureProps) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        <DetailsDialog
          log={{
            ...log,
            ...props.log,
            other: JSON.stringify(props.other ?? other),
          }}
          isAdmin={props.isAdmin ?? true}
          isRoot={props.isRoot ?? false}
          open
          onOpenChange={() => undefined}
        />
      </QueryClientProvider>
    </I18nextProvider>
  )
}

function renderDetails(props: DetailsFixtureProps = {}) {
  return render(<DetailsFixture {...props} />)
}

test('a log with diagnostics opens on its overview with billing visible and raw requests deferred', () => {
  renderDetails()

  expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  const overview = screen.getByRole('tabpanel', { name: 'Overview' })
  expect(overview).toHaveClass('overflow-y-auto', 'min-h-0')
  expect(overview).not.toContainElement(
    screen.getByRole('tablist', { name: 'Log Details' })
  )
  expect(within(overview).getByText('Billing Details')).toBeVisible()
  expect(within(overview).getByText(log.request_id)).toBeVisible()
  expect(screen.queryByRole('tab', { name: 'Inbound Request' })).toBeNull()
  expect(screen.queryByText('trace-1')).toBeNull()
})

test('diagnostic stages switch by keyboard and keep request bodies collapsed until requested', async () => {
  const user = userEvent.setup()
  renderDetails()

  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  const inbound = screen.getByRole('tab', { name: 'Inbound Request' })
  expect(inbound).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('trace-1')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Request Body' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
  expect(screen.queryByRole('textbox', { name: 'Request Body' })).toBeNull()

  await user.click(inbound)
  await user.keyboard('{ArrowRight}')
  expect(screen.getByRole('tab', { name: 'Upstream Request' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('tab', { name: 'Upstream Request' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(screen.getByText('upstream-trace')).toBeVisible()
  expect(screen.queryByText('trace-1')).toBeNull()
})

test('logs without visible diagnostics keep the overview and omit the diagnostic tab', () => {
  renderDetails({ isAdmin: false })

  expect(screen.queryByRole('tab', { name: 'Request Diagnostics' })).toBeNull()
  expect(screen.getByText('Billing Details')).toBeVisible()
  expect(screen.queryByText('trace-1')).toBeNull()
})

test('an empty diagnostic trace does not offer an empty tab', () => {
  renderDetails({
    other: { admin_info: { request_debug: { inbound: {}, response: {} } } },
  })

  expect(screen.queryByRole('tab', { name: 'Request Diagnostics' })).toBeNull()
  expect(screen.getByText(log.request_id)).toBeVisible()
})

test('diagnostic metadata preserves zero byte counts and false flags', async () => {
  const user = userEvent.setup()
  renderDetails({
    other: {
      admin_info: {
        request_debug: {
          inbound: { body_bytes: 0, body_bytes_known: false },
        },
      },
    },
  })

  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  const panel = screen.getByRole('tabpanel', { name: 'Inbound Request' })
  expect(within(panel).getByText('0')).toBeVisible()
  expect(within(panel).getByText('No')).toBeVisible()
})

test('long identifiers and multi-value headers can be copied without losing data', async () => {
  const user = userEvent.setup()
  const headers = {
    'X-Long-Value':
      'a-header-value-that-must-wrap-without-truncation-012345678901234567890123456789',
    'X-Multi-Value': ['first', 'second'],
    'X-Redacted': true,
  }
  renderDetails({
    other: { admin_info: { request_debug: { inbound: { headers } } } },
  })

  await user.click(screen.getByRole('button', { name: 'Copy Request ID' }))
  expect(await navigator.clipboard.readText()).toBe(log.request_id)
  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  expect(screen.getByText(headers['X-Long-Value'])).toBeVisible()
  expect(screen.getByText('first second')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Copy Headers' }))
  expect(await navigator.clipboard.readText()).toBe(
    JSON.stringify(headers, null, 2)
  )
})

test('a response-only trace selects its available stage and identifies the response body', async () => {
  const user = userEvent.setup()
  renderDetails({
    other: {
      admin_info: {
        request_debug: {
          response: { status: 502, body: 'upstream unavailable', headers: {} },
        },
      },
    },
  })

  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  expect(screen.queryByRole('tab', { name: 'Inbound Request' })).toBeNull()
  expect(
    screen.getByRole('tab', { name: 'Upstream Response' })
  ).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('No headers recorded')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Response Body' }))
  const body = await screen.findByRole('textbox', { name: 'Response Body' })
  expect(body).toHaveAttribute('aria-readonly', 'true')
  expect(body).toHaveTextContent('upstream unavailable')
})

test('an administrator without root access can read the preview but cannot load a saved full body', async () => {
  const user = userEvent.setup()
  const get = vi.spyOn(api, 'get')
  renderDetails({
    other: {
      admin_info: {
        request_debug: {
          inbound: {
            body: 'redacted preview',
            body_available: true,
            body_ref: 'saved-body',
          },
        },
      },
    },
  })

  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  await user.click(screen.getByRole('button', { name: 'Request Body' }))
  expect(
    await screen.findByRole('textbox', { name: 'Request Body' })
  ).toHaveTextContent('redacted preview')
  expect(
    screen.queryByRole('button', { name: 'Load full request body' })
  ).toBeNull()
  expect(get).not.toHaveBeenCalled()
})

test('a full body loads only on request, disables duplicate loading, and retries a failed fetch', async () => {
  const user = userEvent.setup()
  const get = vi.spyOn(api, 'get')
  let rejectFetch: (reason: Error) => void = () => undefined
  get.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectFetch = reject
      })
  )
  get.mockResolvedValueOnce({
    data: { success: true, data: { body: 'complete stored request' } },
  })
  renderDetails({
    isRoot: true,
    other: {
      admin_info: {
        request_debug: {
          inbound: { body_available: true, body_ref: 'saved-body' },
        },
      },
    },
  })

  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  await user.click(screen.getByRole('button', { name: 'Request Body' }))
  expect(get).not.toHaveBeenCalled()
  const load = screen.getByRole('button', { name: 'Load full request body' })
  await user.click(load)
  expect(load).toBeDisabled()
  expect(load).toHaveAttribute('aria-busy', 'true')
  expect(get).toHaveBeenCalledExactlyOnceWith(
    '/api/log/saved-body/request-body'
  )

  rejectFetch(new Error('Stored body temporarily unavailable'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Stored body temporarily unavailable'
  )
  await user.click(screen.getByRole('button', { name: 'Retry' }))
  expect(
    await screen.findByRole('textbox', { name: 'Full request body' })
  ).toHaveTextContent('complete stored request')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(
    screen.queryByRole('button', { name: 'Load full request body' })
  ).toBeNull()
})

test('changing the log resets diagnostic selection and removes the previous request body', async () => {
  const user = userEvent.setup()
  const view = renderDetails()
  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  await user.click(screen.getByRole('button', { name: 'Request Body' }))
  expect(
    await screen.findByRole('textbox', { name: 'Request Body' })
  ).toHaveTextContent('Only show this body when expanded')

  view.rerender(
    <DetailsFixture
      log={{ id: 2, request_id: 'next-request' }}
      other={{ admin_info: { request_debug: { response: { status: 204 } } } }}
    />
  )
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  )
  expect(screen.getByText('next-request')).toBeVisible()
  expect(screen.queryByRole('textbox')).toBeNull()
  await user.click(screen.getByRole('tab', { name: 'Request Diagnostics' }))
  expect(
    screen.getByRole('tab', { name: 'Upstream Response' })
  ).toHaveAttribute('aria-selected', 'true')
  expect(screen.queryByText('Only show this body when expanded')).toBeNull()
})
