import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import i18next from 'i18next'
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { OfficialStatusContent } from '..'
import { useOfficialStatus } from '../api'
import type { HistoryDays, OfficialProvider, OfficialSnapshot } from '../types'

const clients: QueryClient[] = []

function report(days: HistoryDays): OfficialSnapshot {
  const providers: OfficialProvider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      icon: 'OpenAI',
      url: 'https://status.openai.com',
      sources: ['https://status.openai.com/api/v2/components.json'],
      status: 'operational',
      sync: {
        state: 'live',
        checked_at: '2026-09-16T04:00:00Z',
        last_success_at: '2026-09-16T04:00:00Z',
      },
      services: [],
      incidents: [],
      history: [],
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      icon: 'Claude',
      url: 'https://status.claude.com',
      sources: [],
      status: 'partial_outage',
      sync: {
        state: 'live',
        checked_at: '2026-09-16T04:00:00Z',
        last_success_at: '2026-09-16T04:00:00Z',
      },
      services: [],
      incidents: [],
      history: [],
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      icon: 'DeepSeek',
      url: 'https://statuspage.flashduty.com/deepseek',
      sources: [],
      status: 'operational',
      sync: {
        state: 'stale',
        error: 'source_unavailable',
        checked_at: '2026-09-16T04:00:00Z',
        last_success_at: '2026-09-16T03:00:00Z',
      },
      services: [],
      incidents: [],
      history: [],
    },
    {
      id: 'kimi',
      name: 'Kimi',
      icon: 'Moonshot',
      url: 'https://www.kimi.com',
      sources: [],
      status: 'unknown',
      sync: { state: 'unconfigured', checked_at: '2026-09-16T04:00:00Z' },
      services: [],
      incidents: [],
      history: [],
    },
  ]
  for (const provider of providers) {
    provider.history = Array.from({ length: days }, (_, i) => ({
      date: new Date(Date.UTC(2026, 8, 17 - days + i))
        .toISOString()
        .slice(0, 10),
      status: 'unknown',
      complete: false,
      incident_ids: [],
    }))
    provider.services = [
      {
        id: 'api',
        name:
          provider.id === 'anthropic' ? 'Claude API' : `${provider.name} API`,
        kind: 'api',
        status: provider.status,
        url: provider.url,
        coverage: {},
        components: [],
        history: provider.history,
      },
    ]
  }
  providers[0].services[0].components = [
    { id: 'responses', name: 'Responses', status: 'operational' },
  ]
  providers[2].services[0].components = [
    {
      id: 'deepseek-api',
      name: 'DeepSeek API',
      status: 'operational',
      availability: [
        {
          days: 90,
          percent: 99.95,
          from: '2026-06-19T00:00:00Z',
          to: '2026-09-17T00:00:00Z',
        },
      ],
    },
  ]
  providers[0].incidents = [
    {
      id: 'restored',
      title: 'Recovered API outage',
      body: '<img src=x onerror=alert(1)> Service restored.',
      url: 'https://status.openai.com/incidents/restored',
      status: 'resolved',
      impact: 'major_outage',
      start_at: '2026-09-15T00:00:00Z',
      end_at: '2026-09-15T01:00:00Z',
      updated_at: '2026-09-15T01:00:00Z',
      component_ids: ['responses'],
      impacts: [
        {
          component_ids: ['responses'],
          status: 'major_outage',
          start_at: '2026-09-15T00:00:00Z',
          end_at: '2026-09-15T01:00:00Z',
        },
      ],
    },
  ]
  providers[0].history[days - 2] = {
    date: '2026-09-15',
    status: 'major_outage',
    complete: true,
    incident_ids: ['restored'],
  }
  providers[0].history[days - 1] = {
    date: '2026-09-16',
    status: 'operational',
    complete: true,
    incident_ids: [],
  }
  return {
    days,
    timezone: 'UTC',
    generated_at: '2026-09-16T04:00:00Z',
    providers,
  }
}

function StatusHarness() {
  const [days, setDays] = useState<HistoryDays>(90)
  return <OfficialStatusContent days={days} onDaysChange={setDays} />
}

async function renderStatus() {
  const get = vi.spyOn(api, 'get').mockImplementation(async (_url, config) => ({
    data: {
      success: true,
      data: report(config?.params.days === 30 ? 30 : 90),
    },
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <StatusHarness />
    </QueryClientProvider>
  )
  await screen.findByRole('heading', { name: 'OpenAI' })
  return get
}

afterEach(async () => {
  clients.splice(0).forEach((client) => client.clear())
  await i18next.changeLanguage('en')
  vi.restoreAllMocks()
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

describe('official availability page', () => {
  it('loads the report when StrictMode remounts a query using the shared HTTP client', async () => {
    const originalAdapter = api.defaults.adapter
    api.defaults.adapter = async (config) => ({
      data: { success: true, data: report(90) },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clients.push(client)
    try {
      render(
        <StrictMode>
          <QueryClientProvider client={client}>
            <StatusHarness />
          </QueryClientProvider>
        </StrictMode>
      )
      expect(
        await screen.findByRole('heading', { name: 'OpenAI' })
      ).toBeVisible()
      expect(
        screen.queryByText('Unable to load official availability')
      ).not.toBeInTheDocument()
    } finally {
      api.defaults.adapter = originalAdapter
    }
  })

  it.each(['zhCN', 'zhTW'])(
    'renders sync dates and official uptime when the interface language is %s',
    async (language) => {
      await i18next.changeLanguage(language)
      await renderStatus()
      const user = userEvent.setup()
      const card = screen.getByLabelText('DeepSeek')
      expect(
        within(card).getByText(/Synced.*9月16日.*03:00.*UTC/)
      ).toBeVisible()
      await user.click(within(card).getByRole('button', { name: 'Details' }))
      const dialog = await screen.findByRole('dialog', { name: 'DeepSeek' })
      expect(
        within(dialog).getByText('Official uptime: 99.95% · 90 days')
      ).toBeVisible()
    }
  )

  it('searches product names and combines the search with a status filter', async () => {
    await renderStatus()
    const user = userEvent.setup()
    await user.type(
      screen.getByRole('textbox', { name: 'Search providers or services' }),
      'Claude'
    )
    expect(
      screen.queryByRole('heading', { name: 'OpenAI' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anthropic' })).toBeVisible()
    const statusFilter = screen.getByRole('combobox', {
      name: 'Filter by status',
    })
    await user.click(statusFilter)
    expect(statusFilter).toHaveAttribute('aria-expanded', 'true')
    const options = await screen.findByRole('listbox')
    expect(
      within(options).getByRole('option', { name: 'All statuses' })
    ).toHaveAttribute('aria-selected', 'true')
    await user.click(
      within(options).getByRole('option', { name: 'Operational' })
    )
    expect(statusFilter).toHaveTextContent('Operational')
    expect(statusFilter).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('No matching providers')).toBeVisible()
    await user.click(statusFilter)
    await user.click(
      await screen.findByRole('option', { name: 'Partial outage' })
    )
    expect(screen.getByRole('heading', { name: 'Anthropic' })).toBeVisible()
  })

  it('defaults to 90 days and requests the selected 30-day window', async () => {
    const get = await renderStatus()
    const user = userEvent.setup()
    const historyWindow = screen.getByRole('combobox', {
      name: 'History window',
    })
    expect(historyWindow).toHaveTextContent('90 days')
    expect(
      within(
        screen.getByRole('toolbar', { name: 'Daily history for OpenAI' })
      ).getAllByRole('button')
    ).toHaveLength(90)
    act(() => historyWindow.focus())
    await user.keyboard(' ')
    expect(historyWindow).toHaveAttribute('aria-expanded', 'true')
    expect(
      await screen.findByRole('option', { name: '90 days' })
    ).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{Home}{Enter}')
    expect(historyWindow).toHaveTextContent('30 days')
    expect(historyWindow).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/api/official-status',
        expect.objectContaining({ params: { days: 30 } })
      )
    )
    await waitFor(() =>
      expect(
        within(
          screen.getByRole('toolbar', { name: 'Daily history for OpenAI' })
        ).getAllByRole('button')
      ).toHaveLength(30)
    )
  })

  it('omits unconfirmed providers from cards and counts while retaining stale report warnings', async () => {
    await renderStatus()
    const user = userEvent.setup()
    expect(
      screen.getByText('Sync failed. Showing the last successful report.')
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Kimi' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Unable to confirm from an official source.')
    ).not.toBeInTheDocument()
    expect(screen.getByText('Providers').nextElementSibling).toHaveTextContent(
      '3'
    )
    expect(screen.queryByText('Unconfirmed')).not.toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: 'Filter by status' }))
    const options = await screen.findByRole('listbox')
    expect(
      within(options).queryByRole('option', { name: 'Unknown' })
    ).not.toBeInTheDocument()
    await user.click(
      within(options).getByRole('option', { name: 'Stale data' })
    )
    expect(screen.getByRole('heading', { name: 'DeepSeek' })).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'OpenAI' })
    ).not.toBeInTheDocument()
  })

  it('opens a recovered outage using arrow keys and Enter and safely displays the official text', async () => {
    await renderStatus()
    const user = userEvent.setup()
    const toolbar = screen.getByRole('toolbar', {
      name: 'Daily history for OpenAI',
    })
    const today = within(toolbar).getByRole('button', {
      name: '2026-09-16 UTC: Operational',
    })
    act(() => today.focus())
    await user.keyboard('{ArrowLeft}{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'OpenAI' })
    expect(within(dialog).getByText('Recovered API outage')).toBeVisible()
    expect(within(dialog).getByText('Resolved')).toBeVisible()
    expect(
      within(dialog).getByText('<img src=x onerror=alert(1)> Service restored.')
    ).toBeVisible()
    expect(dialog.querySelector('img')).toBeNull()
    expect(
      within(dialog).getByRole('link', { name: 'Official announcement' })
    ).toHaveAttribute('href', 'https://status.openai.com/incidents/restored')
    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
    await waitFor(() =>
      expect(
        within(toolbar).getByRole('button', {
          name: '2026-09-15 UTC: Major outage',
        })
      ).toHaveFocus()
    )
  })

  it('retains the previous report with an error message when manual refresh fails', async () => {
    const get = await renderStatus()
    get.mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(
      await screen.findByText(
        'The refresh failed. The previous report is still displayed.'
      )
    ).toBeVisible()
    expect(screen.getByRole('heading', { name: 'OpenAI' })).toBeVisible()
  })

  it('shows an empty state when no provider has a confirmed status and keeps refresh available', async () => {
    const get = await renderStatus()
    const unavailable = report(90)
    unavailable.providers = unavailable.providers.filter(
      (provider) => provider.status === 'unknown'
    )
    get.mockResolvedValueOnce({ data: { success: true, data: unavailable } })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(await screen.findByText('No data available')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Kimi' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('Providers').nextElementSibling).toHaveTextContent(
      '0'
    )
    expect(screen.queryByText('No matching providers')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
  })

  it('keeps a single-column mobile layout and wraps expanded translations', async () => {
    await renderStatus()
    const user = userEvent.setup()
    i18next.addResourceBundle('fr', 'translation', {
      'Official availability': 'Disponibilité officielle des services',
      'All statuses': 'Tous les états',
      'Performance degradation': 'Dégradation des performances',
      'Sources are cached for five minutes. All dates use UTC.':
        'Les sources sont mises en cache pendant cinq minutes. Toutes les dates sont en UTC.',
    })
    await act(() => i18next.changeLanguage('fr'))
    expect(
      screen.getByRole('heading', {
        name: 'Disponibilité officielle des services',
      })
    ).toBeVisible()
    expect(screen.getByLabelText('Provider status cards')).toHaveClass(
      'grid-cols-1',
      'lg:grid-cols-2',
      'min-w-0'
    )
    expect(screen.getByRole('heading', { name: 'OpenAI' })).toHaveClass(
      'break-words'
    )
    const statusFilter = screen.getByRole('combobox', {
      name: 'Filter by status',
    })
    expect(statusFilter).toHaveClass('basis-full', 'sm:basis-auto')
    expect(statusFilter).toHaveTextContent('Tous les états')
    await user.click(statusFilter)
    expect(
      await screen.findByRole('option', {
        name: 'Dégradation des performances',
      })
    ).toBeVisible()
    await user.keyboard('{Escape}')
    expect(statusFilter).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(statusFilter).toHaveFocus())
    expect(
      screen.getByText(
        'Les sources sont mises en cache pendant cinq minutes. Toutes les dates sont en UTC.'
      )
    ).toBeVisible()
  })

  it('pauses periodic refresh in background tabs and resumes when the tab becomes active', async () => {
    vi.useFakeTimers()
    focusManager.setFocused(false)
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { success: true, data: report(90) } })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clients.push(client)
    client.setQueryData(['official-status', 90], report(90))
    renderHook(() => useOfficialStatus(90), {
      wrapper: (props) => (
        <QueryClientProvider client={client}>
          {props.children}
        </QueryClientProvider>
      ),
    })
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(get).not.toHaveBeenCalled()
    await act(async () => {
      focusManager.setFocused(true)
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(get).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(get).toHaveBeenCalledTimes(2)
  })
})
