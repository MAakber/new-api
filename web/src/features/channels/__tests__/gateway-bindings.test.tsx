import { screen, waitFor } from '@testing-library/react'
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

it('saves a gateway binding and its models while preserving ordinary models and the stored key', async () => {
  useAuthStore.getState().auth.setUser({ id: 1, username: 'root', role: 100 })
  const channel = channelSchema.parse({
    id: 7,
    type: 60,
    name: 'Gateway',
    key: '',
    status: 1,
    created_time: 1,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    base_url: 'https://gateway.example',
    models: 'ordinary-chat',
    group: 'default',
    setting: '{}',
  })
  const updates: ChannelUpdatePayload[] = []
  const adapter: AxiosAdapter = async (config) => {
    let data: unknown = { success: true, data: [] }
    if (config.url === '/api/channel/7') data = { success: true, data: channel }
    if (config.url === '/api/channel/7/custom-balance') {
      data = { success: true, data: { enabled: false } }
    }
    if (config.url === '/api/group/') {
      data = { success: true, data: ['default'] }
    }
    if (config.url === '/api/task_plugin_options') {
      data = {
        success: true,
        data: [
          {
            key: 'typesafe',
            name: 'TypeSafe',
            models: ['jev-latest'],
            upstreams: ['vendor', 'new_api'],
            icon: 'text:TS',
          },
          {
            key: 'vendor-only',
            name: 'Vendor Only',
            models: ['private-model'],
            upstreams: ['vendor'],
          },
        ],
      }
    }
    if (config.method === 'put' && config.url === '/api/channel/') {
      updates.push(JSON.parse(String(config.data)) as ChannelUpdatePayload)
      data = { success: true, data: channel }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  api.defaults.adapter = adapter
  const user = userEvent.setup()
  renderChannelUI(
    <ChannelMutateDrawer
      open
      currentRow={channel}
      presentation='window'
      onOpenChange={vi.fn()}
    />
  )
  const selector = await screen.findByRole('combobox', {
    name: 'Upstream task plugins',
  })
  await user.click(selector)
  expect(
    screen.queryByRole('option', { name: 'Vendor Only' })
  ).not.toBeInTheDocument()
  await user.click(await screen.findByRole('option', { name: 'TypeSafe' }))
  await user.keyboard('{Escape}')
  await user.click(screen.getAllByRole('button', { name: 'Update Channel' })[0])
  await waitFor(() => expect(updates).toHaveLength(1))
  expect(JSON.parse(updates[0].setting ?? '{}')).toMatchObject({
    task_extend_plugin_keys: ['typesafe'],
  })
  expect(updates[0].models?.split(',')).toEqual(['ordinary-chat', 'jev-latest'])
  expect(updates[0]).not.toHaveProperty('key')
})
