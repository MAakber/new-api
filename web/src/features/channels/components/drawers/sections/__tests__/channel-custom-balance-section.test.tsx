/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLInputElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'CustomEvent',
  'MutationObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { api } = await import('@/lib/api')
const { ChannelCustomBalanceSection } =
  await import('../channel-custom-balance-section')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const originalGet = api.get
const originalPut = api.put

const responseWithSecret = {
  success: true,
  data: {
    enabled: false,
    provider: 'new_api',
    use_channel_key: true,
    auth_type: 'token',
    credential_set: true,
    credential: 'must-not-render',
    user_id: '',
    quota_per_unit: 500000,
    auto_balance: false,
    auto_checkin: false,
    balance_interval_seconds: 3600,
    checkin_interval_seconds: 86400,
    retry_max_attempts: 3,
    retry_interval_seconds: 300,
    next_balance_at: null,
    next_checkin_at: null,
    last_balance_at: null,
    last_balance_status: null,
    last_balance_error: null,
    last_checkin_at: null,
    last_checkin_status: null,
    last_checkin_error: null,
  },
}

type RenderedSection = {
  container: HTMLDivElement
  root: ReturnType<typeof createRoot>
  queryClient: InstanceType<typeof QueryClient>
}

type CustomBalanceSectionHandle = {
  save: () => Promise<boolean>
}

function installGetMock() {
  api.get = (async () => ({ data: responseWithSecret })) as typeof api.get
}

function restoreApi() {
  api.get = originalGet
  api.put = originalPut
}

async function renderSection(
  onConfiguredChange?: (configured: boolean) => void,
  onDirtyChange?: (dirty: boolean) => void,
  ref?: { current: CustomBalanceSectionHandle | null }
): Promise<RenderedSection> {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ChannelCustomBalanceSection
            channelId={42}
            disabled={false}
            ref={ref}
            onConfiguredChange={onConfiguredChange}
            onDirtyChange={onDirtyChange}
          />
        </I18nextProvider>
      </QueryClientProvider>
    )
  })
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: ['channels', 42, 'custom-balance'],
    })
  })

  return { container, root, queryClient }
}

async function cleanupSection(view: RenderedSection) {
  await act(async () => view.root.unmount())
  view.container.remove()
  view.queryClient.clear()
}

function click(element: HTMLElement) {
  element.dispatchEvent(
    new domWindow.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }) as unknown as MouseEvent
  )
}

async function flushReact() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function waitForElement(container: HTMLElement, selector: string) {
  if (container.querySelector(selector)) return

  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!container.querySelector(selector)) return
      observer.disconnect()
      resolve()
    })
    observer.observe(container, { childList: true, subtree: true })
  })
}

function getButton(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(text)
  )
  assert.ok(button)
  return button
}

describe('channel custom balance section', () => {
  after(() => {
    restoreApi()
    domWindow.close()
  })

  test('does not echo the credential and hides channel-key mode for New API', async () => {
    installGetMock()
    const view = await renderSection()

    try {
      await flushReact()
      await act(async () => {
        await waitForElement(view.container, 'input[type="password"]')
      })
      const credentialInput = view.container.querySelector<HTMLInputElement>(
        'input[type="password"]'
      )
      assert.ok(credentialInput)
      assert.equal(credentialInput.value, '')
      assert.equal(credentialInput.disabled, false)
      assert.doesNotMatch(view.container.textContent || '', /Use channel key/)
      assert.match(view.container.textContent || '', /Credential set/)
    } finally {
      await cleanupSection(view)
      restoreApi()
    }
  })

  test('shows the backend failure message when saving the independent configuration fails', async () => {
    installGetMock()
    api.put = (async () => ({
      data: { success: false, message: 'custom balance permission denied' },
    })) as typeof api.put
    const view = await renderSection()

    try {
      await flushReact()
      await act(async () => {
        await waitForElement(view.container, '[role="switch"]')
      })
      const switches = [
        ...view.container.querySelectorAll<HTMLElement>('[role="switch"]'),
      ]
      assert.ok(switches.length >= 2)
      await act(async () => click(switches[1]))
      await flushReact()

      const credentialInput = view.container.querySelector<HTMLInputElement>(
        'input[type="password"]'
      )
      assert.ok(credentialInput)
      assert.equal(credentialInput.disabled, false)

      const saveButton = getButton(
        view.container,
        'Save custom balance settings'
      )
      assert.equal(saveButton.hasAttribute('disabled'), false)
      await act(async () => click(saveButton))
      await flushReact()

      assert.match(
        view.container.textContent || '',
        /custom balance permission denied/
      )
    } finally {
      await cleanupSection(view)
      restoreApi()
    }
  })

  test('reports enabled state immediately for the editor navigation', async () => {
    installGetMock()
    let configured: boolean | undefined
    let dirty: boolean | undefined
    const view = await renderSection(
      (value) => {
        configured = value
      },
      (value) => {
        dirty = value
      }
    )

    try {
      await flushReact()
      await act(async () => {
        await waitForElement(view.container, '[role="switch"]')
      })
      const switches = [
        ...view.container.querySelectorAll<HTMLElement>('[role="switch"]'),
      ]
      assert.ok(switches.length >= 1)
      await act(async () => click(switches[0]))
      await flushReact()

      assert.equal(configured, true)
      assert.equal(dirty, true)
    } finally {
      await cleanupSection(view)
      restoreApi()
    }
  })

  test('exposes the same save path for the parent channel submit', async () => {
    installGetMock()
    let putCalls = 0
    api.put = (async () => {
      putCalls += 1
      return { data: responseWithSecret }
    }) as typeof api.put
    const ref = { current: null as CustomBalanceSectionHandle | null }
    const view = await renderSection(undefined, undefined, ref)

    try {
      await flushReact()
      await act(async () => {
        await waitForElement(view.container, '[role="switch"]')
      })
      const enabledSwitch =
        view.container.querySelector<HTMLElement>('[role="switch"]')
      assert.ok(enabledSwitch)
      await act(async () => click(enabledSwitch))

      let saved = false
      await act(async () => {
        saved = (await ref.current?.save()) ?? false
      })

      assert.equal(saved, true)
      assert.equal(putCalls, 1)
    } finally {
      await cleanupSection(view)
      restoreApi()
    }
  })
})
