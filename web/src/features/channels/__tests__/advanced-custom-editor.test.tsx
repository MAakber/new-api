import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AdvancedCustomEditorDialog } from '../components/dialogs/advanced-custom-editor-dialog'
import {
  ADVANCED_CUSTOM_BALANCE_PATH,
  ADVANCED_CUSTOM_MODEL_LIST_PATH,
} from '../lib/advanced-custom'
import type { AdvancedCustomConfig } from '../types'
import { renderChannelUI } from './fetch-models-fixtures'

vi.mock('@/components/json-code-editor', () => ({ JsonCodeEditor: () => null }))

const models = {
  incoming_path: ADVANCED_CUSTOM_MODEL_LIST_PATH,
  upstream_path: '/provider/models',
}
const balance = {
  incoming_path: ADVANCED_CUSTOM_BALANCE_PATH,
  upstream_path: '/provider/balance',
}
const fallback = {
  incoming_path: '/v1/chat/completions',
  upstream_path: '/fallback',
}
const scoped = {
  incoming_path: '/v1/chat/completions',
  upstream_path: '/special',
  models: ['gpt-4o'],
}

describe('advanced custom management and forwarding routes', () => {
  it('adds a model split from an expanded group with a collapsible header', async () => {
    const user = userEvent.setup()
    renderChannelUI(
      <AdvancedCustomEditorDialog
        open
        value={JSON.stringify({ advanced_routes: [fallback] })}
        onOpenChange={vi.fn()}
        onSave={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.queryByRole('button', { name: 'Add split' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    await user.click(screen.getByRole('button', { name: 'Add split' }))
    expect(
      screen.getByRole('tab', { name: /^Forwarding Routes\s*2$/ })
    ).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: /OpenAI Chat.*\/v1\/chat\/completions\s*2 Routes/,
      })
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('fixes fallback ordering without removing model discovery or balance routes', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(value: string) => void>()
    renderChannelUI(
      <AdvancedCustomEditorDialog
        open
        value={JSON.stringify({
          advanced_routes: [models, fallback, scoped, balance],
        })}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )
    await user.click(screen.getByRole('button', { name: 'Fix order' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(onSave.mock.calls[0][0]) as AdvancedCustomConfig
    expect(saved.advanced_routes?.map((route) => route.upstream_path)).toEqual([
      '/provider/models',
      '/special',
      '/fallback',
      '/provider/balance',
    ])
  })

  it('replaces forwarding templates while keeping management routes and their credentials', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn<(value: string) => void>()
    const balanceWithAuth = {
      ...balance,
      auth: { type: 'query', name: 'key', value: '{api_key}' },
    }
    renderChannelUI(
      <AdvancedCustomEditorDialog
        open
        value={JSON.stringify({
          advanced_routes: [models, fallback, balanceWithAuth],
        })}
        onOpenChange={vi.fn()}
        onSave={onSave}
      />
    )
    await user.click(screen.getByRole('combobox', { name: 'Add template' }))
    await user.click(screen.getByRole('option', { name: 'Claude only' }))
    await user.click(screen.getByRole('button', { name: 'Replace' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(onSave.mock.calls[0][0]) as AdvancedCustomConfig
    expect(
      saved.advanced_routes?.find(
        (route) => route.incoming_path === ADVANCED_CUSTOM_BALANCE_PATH
      )?.auth
    ).toEqual(balanceWithAuth.auth)
    expect(saved.advanced_routes?.map((route) => route.incoming_path)).toEqual([
      ADVANCED_CUSTOM_MODEL_LIST_PATH,
      '/v1/messages',
      ADVANCED_CUSTOM_BALANCE_PATH,
    ])
  })
})
