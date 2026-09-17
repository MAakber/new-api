import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '@/lib/api'

import { SubscriptionPlansCard } from '../subscription-plans-card'

const originalAdapter = api.defaults.adapter
let queryClient: QueryClient | undefined

afterEach(() => {
  api.defaults.adapter = originalAdapter
  queryClient?.clear()
})

describe('persisted subscription billing preference', () => {
  it.each([
    {
      preference: 'subscription_only',
      label: 'Subscription Only',
      explanation: 'Requests will be rejected.',
    },
    {
      preference: 'subscription_first',
      label: 'Subscription First',
      explanation: 'Wallet will be used automatically.',
    },
  ])(
    'shows $preference honestly when the last subscription has expired',
    async (test) => {
      api.defaults.adapter = async (config) => {
        const data =
          config.url === '/api/subscription/plans'
            ? []
            : {
                billing_preference: test.preference,
                subscriptions: [],
                all_subscriptions: [
                  {
                    subscription: {
                      id: 41,
                      plan_id: 1,
                      status: 'expired',
                      start_time: 1,
                      end_time: 2,
                      amount_total: 10,
                      amount_used: 10,
                    },
                  },
                ],
              }
        return {
          data: { success: true, data },
          config,
          status: 200,
          statusText: 'OK',
          headers: {},
        }
      }
      queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      render(
        <QueryClientProvider client={queryClient}>
          <SubscriptionPlansCard topupInfo={null} />
        </QueryClientProvider>
      )
      await screen.findByText('My Subscriptions')
      expect(screen.getByRole('combobox').textContent).toContain(test.label)
      expect(
        screen.getByText((text) => text.endsWith(test.explanation))
      ).toBeDefined()
    }
  )
})
