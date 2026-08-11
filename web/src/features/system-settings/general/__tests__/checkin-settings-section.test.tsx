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
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

import type { UpdateOptionRequest } from '../../types'

const domWindow = new Window()
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLFormElement',
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
const { api } = await import('../../../../lib/api')
const { CheckinSettingsSection } = await import('../checkin-settings-section')
const { SettingsPageProvider } =
  await import('../../components/settings-page-context')

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

type CheckinDefaults = {
  enabled: boolean
  minQuota: number
  maxQuota: number
  balanceTierEnabled: boolean
  balanceTiers: string
}

type RenderedSection = {
  container: HTMLDivElement
  actions: HTMLDivElement
  root: ReturnType<typeof createRoot>
  queryClient: InstanceType<typeof QueryClient>
}

const originalPut = api.put
let requests: UpdateOptionRequest[] = []

function installOptionUpdateMock() {
  requests = []
  api.put = (async (_url, data) => {
    requests.push(data as UpdateOptionRequest)
    return { data: { success: true, message: '' } }
  }) as typeof api.put
}

function restoreOptionUpdate() {
  api.put = originalPut
}

async function renderSection(defaults: CheckinDefaults) {
  const container = document.createElement('div')
  const actions = document.createElement('div')
  document.body.append(container, actions)

  const root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <SettingsPageProvider actionsContainer={actions}>
            <CheckinSettingsSection defaultValues={defaults} />
          </SettingsPageProvider>
        </I18nextProvider>
      </QueryClientProvider>
    )
  })

  return { container, actions, root, queryClient }
}

async function cleanupSection(view: RenderedSection) {
  await act(async () => view.root.unmount())
  view.container.remove()
  view.actions.remove()
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

function changeInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    domWindow.HTMLInputElement.prototype,
    'value'
  )?.set
  assert.ok(valueSetter)
  valueSetter.call(input, value)
  input.dispatchEvent(
    new domWindow.Event('input', { bubbles: true }) as unknown as Event
  )
}

function getButton(container: HTMLElement, text: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) =>
    candidate.textContent?.includes(text)
  )
  assert.ok(button)
  return button
}

function getSaveButton(actions: HTMLElement) {
  return getButton(actions, 'Save check-in settings')
}

function getTierInputs(container: HTMLElement, label: string) {
  return [
    ...container.querySelectorAll<HTMLInputElement>(
      `input[aria-label="${label}"]`
    ),
  ]
}

describe('check-in balance reward tiers', () => {
  after(() => {
    restoreOptionUpdate()
    domWindow.close()
  })

  test('adds, reorders, and removes a balance reward tier', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: true,
      balanceTiers: '[]',
    })

    try {
      const addButton = getButton(view.container, 'Add tier')
      await act(async () => click(addButton))
      await act(async () => click(addButton))
      assert.equal(getTierInputs(view.container, 'Minimum balance').length, 2)

      const balances = getTierInputs(view.container, 'Minimum balance')
      await act(async () => changeInputValue(balances[0], '10'))
      await act(async () => changeInputValue(balances[1], '20'))

      const moveDownButton = view.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Move tier down"]'
      )
      assert.ok(moveDownButton)
      await act(async () => click(moveDownButton))
      assert.deepEqual(
        getTierInputs(view.container, 'Minimum balance').map(
          (input) => input.value
        ),
        ['20', '10']
      )

      const removeButtons = [
        ...view.container.querySelectorAll<HTMLButtonElement>(
          'button[aria-label="Remove tier"]'
        ),
      ]
      await act(async () => click(removeButtons[1]))
      assert.equal(getTierInputs(view.container, 'Minimum balance').length, 1)
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('rejects duplicate balances and an invalid reward range', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: true,
      balanceTiers: '[]',
    })

    try {
      const addButton = getButton(view.container, 'Add tier')
      await act(async () => click(addButton))
      await act(async () => click(addButton))

      const balances = getTierInputs(view.container, 'Minimum balance')
      const minimumRewards = getTierInputs(view.container, 'Minimum reward')
      const maximumRewards = getTierInputs(view.container, 'Maximum reward')
      await act(async () => changeInputValue(balances[0], '10'))
      await act(async () => changeInputValue(balances[1], '10'))
      await act(async () => changeInputValue(minimumRewards[0], '5'))
      await act(async () => changeInputValue(maximumRewards[0], '2'))

      await act(async () => click(getSaveButton(view.actions)))

      const errors = new Set(
        [...view.container.querySelectorAll('[data-slot="form-message"]')].map(
          (message) => message.textContent
        )
      )
      assert.ok(errors.has('Minimum balances must be unique'))
      assert.ok(errors.has('Minimum reward must not exceed maximum reward'))
      assert.equal(requests.length, 0)
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('requires a valid tier before enabling balance rewards', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: false,
      balanceTiers: '[]',
    })

    try {
      const switches = [
        ...view.container.querySelectorAll<HTMLElement>('[role="switch"]'),
      ]
      assert.equal(switches.length, 2)
      await act(async () => click(switches[1]))
      await act(async () => click(getSaveButton(view.actions)))

      const errors = new Set(
        [...view.container.querySelectorAll('[data-slot="form-message"]')].map(
          (message) => message.textContent
        )
      )
      assert.ok(
        errors.has(
          'At least one valid balance reward tier is required when balance rewards are enabled'
        )
      )
      assert.equal(requests.length, 0)
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('rejects a legacy quota range where minimum exceeds maximum', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: false,
      balanceTiers: '[]',
    })

    try {
      const quotaInputs = view.container.querySelectorAll<HTMLInputElement>(
        'input[type="number"]'
      )
      await act(async () => changeInputValue(quotaInputs[0], '20000'))
      await act(async () => changeInputValue(quotaInputs[1], '10000'))
      await act(async () => click(getSaveButton(view.actions)))

      const errors = [
        ...view.container.querySelectorAll('[data-slot="form-message"]'),
      ].map((message) => message.textContent)
      assert.ok(
        errors.includes(
          'Minimum check-in quota cannot exceed maximum check-in quota'
        )
      )
      assert.equal(requests.length, 0)
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('saves the legacy random quota fields while tiers are disabled', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: false,
      balanceTiers: '[]',
    })

    try {
      assert.equal(getTierInputs(view.container, 'Minimum balance').length, 0)
      const quotaInputs = view.container.querySelectorAll<HTMLInputElement>(
        'input[type="number"]'
      )
      assert.equal(quotaInputs.length, 2)
      await act(async () => changeInputValue(quotaInputs[0], '2000'))
      await act(async () => changeInputValue(quotaInputs[1], '3000'))
      await act(async () => click(getSaveButton(view.actions)))

      assert.deepEqual(requests, [
        { key: 'checkin_setting.min_quota', value: '2000' },
        { key: 'checkin_setting.max_quota', value: '3000' },
      ])
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('saves enabled tiers as sorted backend JSON', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: true,
      balanceTiers: '[]',
    })

    try {
      const addButton = getButton(view.container, 'Add tier')
      await act(async () => click(addButton))
      await act(async () => click(addButton))

      const balances = getTierInputs(view.container, 'Minimum balance')
      const minimumRewards = getTierInputs(view.container, 'Minimum reward')
      const maximumRewards = getTierInputs(view.container, 'Maximum reward')
      await act(async () => changeInputValue(balances[0], '500'))
      await act(async () => changeInputValue(balances[1], '100'))
      await act(async () => changeInputValue(minimumRewards[0], '50'))
      await act(async () => changeInputValue(maximumRewards[0], '60'))
      await act(async () => changeInputValue(minimumRewards[1], '10'))
      await act(async () => changeInputValue(maximumRewards[1], '20'))

      await act(async () => click(getSaveButton(view.actions)))

      assert.deepEqual(requests, [
        {
          key: 'checkin_setting.balance_tiers',
          value:
            '[{"min_balance":100,"min_reward":10,"max_reward":20},{"min_balance":500,"min_reward":50,"max_reward":60}]',
        },
      ])
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('writes tiers before enabling balance rewards', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: true,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: false,
      balanceTiers: '[]',
    })

    try {
      const switches = [
        ...view.container.querySelectorAll<HTMLElement>('[role="switch"]'),
      ]
      assert.equal(switches.length, 2)
      await act(async () => click(switches[1]))

      const addButton = getButton(view.container, 'Add tier')
      await act(async () => click(addButton))
      const balances = getTierInputs(view.container, 'Minimum balance')
      const minimumRewards = getTierInputs(view.container, 'Minimum reward')
      const maximumRewards = getTierInputs(view.container, 'Maximum reward')
      await act(async () => changeInputValue(balances[0], '100'))
      await act(async () => changeInputValue(minimumRewards[0], '10'))
      await act(async () => changeInputValue(maximumRewards[0], '20'))
      await act(async () => click(getSaveButton(view.actions)))

      assert.deepEqual(requests, [
        {
          key: 'checkin_setting.balance_tiers',
          value: '[{"min_balance":100,"min_reward":10,"max_reward":20}]',
        },
        { key: 'checkin_setting.balance_tier_enabled', value: 'true' },
      ])
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })

  test('invalidates the status cache when check-in is enabled', async () => {
    installOptionUpdateMock()
    const view = await renderSection({
      enabled: false,
      minQuota: 1000,
      maxQuota: 10000,
      balanceTierEnabled: false,
      balanceTiers: '[]',
    })

    try {
      view.queryClient.setQueryData(['status'], { ready: true })
      const featureSwitch =
        view.container.querySelector<HTMLElement>('[role="switch"]')
      assert.ok(featureSwitch)
      await act(async () => click(featureSwitch))
      await act(async () => click(getSaveButton(view.actions)))

      assert.deepEqual(requests, [
        { key: 'checkin_setting.enabled', value: 'true' },
      ])
      assert.equal(
        view.queryClient.getQueryState(['status'])?.isInvalidated,
        true
      )
    } finally {
      await cleanupSection(view)
      restoreOptionUpdate()
    }
  })
})
