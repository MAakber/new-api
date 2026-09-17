import { describe, expect, test } from 'vitest'

import { resolveLegacyRoute } from './legacy-route'

describe('legacy frontend route migration', () => {
  test('maps former public and console routes to their current destinations', () => {
    const routes = {
      '/login': '/sign-in',
      '/forbidden': '/403',
      '/console': '/dashboard',
      '/console/models': '/models',
      '/console/deployment': '/models/deployments',
      '/console/subscription': '/subscriptions',
      '/console/channel': '/channels',
      '/console/token': '/keys',
      '/console/playground': '/playground',
      '/console/redemption': '/redemption-codes',
      '/console/user': '/users',
      '/console/personal': '/profile',
      '/console/log': '/usage-logs',
      '/console/midjourney': '/usage-logs/drawing',
      '/console/task': '/usage-logs/task',
      '/console/chat/42': '/chat/42',
    }

    for (const [source, target] of Object.entries(routes)) {
      expect(resolveLegacyRoute(source)).toBe(target)
    }
  })

  test('preserves search and hash while applying route-specific behavior', () => {
    expect(resolveLegacyRoute('/login?redirect=%2Fkeys#continue')).toBe(
      '/sign-in?redirect=%2Fkeys#continue'
    )
    expect(resolveLegacyRoute('/console/topup?source=email#orders')).toBe(
      '/wallet?source=email#orders'
    )
  })

  test('maps legacy settings tabs and retains unrelated parameters', () => {
    const settingsTabs = {
      operation: '/system-settings/operations/behavior',
      dashboard: '/system-settings/content/dashboard',
      chats: '/system-settings/content/chat',
      drawing: '/system-settings/content/drawing',
      payment: '/system-settings/billing/payment',
      ratio: '/system-settings/billing/model-pricing',
      ratelimit: '/system-settings/security/rate-limit',
      models: '/system-settings/models/global',
      'model-deployment': '/system-settings/models/model-deployment',
      performance: '/system-settings/operations/performance',
      system: '/system-settings/site/system-info',
      other: '/system-settings/site/system-info',
    }

    for (const [tab, target] of Object.entries(settingsTabs)) {
      expect(
        resolveLegacyRoute(`/console/setting?tab=${tab}&from=bookmark#form`)
      ).toBe(`${target}?tab=${tab}&from=bookmark#form`)
    }
    expect(resolveLegacyRoute('/console/setting?tab=unknown')).toBe(
      '/system-settings?tab=unknown'
    )
  })

  test('safely redirects unknown console locations without touching new routes', () => {
    expect(resolveLegacyRoute('/console/removed?page=2#old')).toBe(
      '/dashboard?page=2#old'
    )
    expect(resolveLegacyRoute('/dashboard')).toBe(null)
    expect(resolveLegacyRoute('/api/status')).toBe(null)
  })
})
