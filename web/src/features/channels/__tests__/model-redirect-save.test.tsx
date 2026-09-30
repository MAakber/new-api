import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosAdapter } from 'axios'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { ChannelMutateDrawer } from '../components/drawers/channel-mutate-drawer'
import { channelSchema, type ChannelUpdatePayload } from '../types'
import { renderChannelUI } from './fetch-models-fixtures'

const originalAdapter = api.defaults.adapter
afterEach(() => {
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.setUser(null)
})

it('applies redirects to the channel form, retains them after a failed save, and submits aliases and targets in the right direction', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const channel = channelSchema.parse({
    id: 17,
    type: 1,
    name: 'Mapping fixture',
    key: '',
    status: 1,
    created_time: 1,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    base_url: 'https://provider.example',
    models: 'provider',
    group: 'default',
    setting: '{}',
    model_mapping: '',
  })
  const updates: ChannelUpdatePayload[] = []
  let failSave = true
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown = { success: true, data: [] }
    if (config.url === '/api/channel/17') {
      data = { success: true, data: channel }
    }
    if (config.url === '/api/channel/17/custom-balance') {
      data = { success: true, data: { enabled: false } }
    }
    if (config.url === '/api/group/') {
      data = { success: true, data: ['default'] }
    }
    if (config.method === 'put' && config.url === '/api/channel/') {
      const update = JSON.parse(String(config.data)) as ChannelUpdatePayload
      updates.push(update)
      if (failSave) {
        data = { success: false, message: 'save rejected by fixture' }
      } else {
        Object.assign(channel, update)
        data = { success: true, data: channel }
      }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  api.defaults.adapter = adapter
  const user = userEvent.setup()
  const props = {
    open: true,
    currentRow: channel,
    presentation: 'window' as const,
    onOpenChange: vi.fn(),
  }
  const view = renderChannelUI(<ChannelMutateDrawer {...props} />)
  await user.click(
    await screen.findByRole('button', { name: 'Edit model redirects' })
  )
  await user.click(screen.getByRole('button', { name: 'Add Mapping' }))
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Request Model Name' }),
    { target: { value: 'public' } }
  )
  fireEvent.change(
    screen.getByRole('combobox', { name: 'Upstream Model Name' }),
    { target: { value: 'provider' } }
  )
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Add missing request models when applying',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Apply' }))
  expect(updates).toHaveLength(0)
  await user.click(screen.getAllByRole('button', { name: 'Update Channel' })[0])
  await waitFor(() => expect(updates).toHaveLength(1))
  await waitFor(() =>
    expect(
      screen.getAllByRole('button', { name: 'Update Channel' })[0]
    ).toBeEnabled()
  )
  await user.click(screen.getByRole('button', { name: 'Edit model redirects' }))
  expect(
    screen.getByRole('combobox', { name: 'Request Model Name' })
  ).toHaveValue('public')
  expect(
    screen.getByRole('combobox', { name: 'Upstream Model Name' })
  ).toHaveValue('provider')
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  failSave = false
  await user.click(screen.getAllByRole('button', { name: 'Update Channel' })[0])
  await waitFor(() => expect(updates).toHaveLength(2))
  expect(JSON.parse(updates[1].model_mapping ?? '')).toEqual({
    public: 'provider',
  })
  expect(updates[1].models?.split(',')).toEqual(['provider', 'public'])
  expect(updates[1]).not.toHaveProperty('key')
  view.unmount()
  renderChannelUI(<ChannelMutateDrawer {...props} />)
  await user.click(
    await screen.findByRole('button', { name: 'Edit model redirects' })
  )
  expect(
    screen.getByRole('combobox', { name: 'Upstream Model Name' })
  ).toHaveValue('provider')
}, 15000)
