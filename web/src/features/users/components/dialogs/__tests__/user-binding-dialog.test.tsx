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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import { api } from '@/lib/api'

import { UserBindingDialog } from '../user-binding-dialog'

type ApiMethod = (url: string) => Promise<{ data: unknown }>
type MockableApi = {
  get: ApiMethod
  delete: ApiMethod
}

const apiClient = api as unknown as MockableApi
const originalGet = apiClient.get
const originalDelete = apiClient.delete
const originalGetAnimations = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'getAnimations'
)

const user = {
  id: 7,
  username: 'bound-user',
  email: 'user@example.com',
  github_id: 'github-user',
  discord_id: 'discord-user',
  wechat_id: 'wechat-user',
  oidc_id: 'oidc-user',
  telegram_id: 'telegram-user',
  linux_do_id: 'linuxdo-user',
}

function findUnbindButton(provider: string): HTMLButtonElement {
  return within(screen.getByRole('group', { name: provider })).getByRole(
    'button',
    { name: 'Unbind' }
  )
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value: () => [],
  })
})

afterAll(() => {
  if (originalGetAnimations) {
    Object.defineProperty(
      HTMLElement.prototype,
      'getAnimations',
      originalGetAnimations
    )
    return
  }
  Reflect.deleteProperty(HTMLElement.prototype, 'getAnimations')
})

afterEach(() => {
  apiClient.get = originalGet
  apiClient.delete = originalDelete
})

describe('UserBindingDialog built-in bindings', () => {
  test('submits every built-in provider type accepted by the backend', async () => {
    const interaction = userEvent.setup()
    const deletedUrls: string[] = []
    apiClient.get = async (url) => {
      switch (url) {
        case '/api/user/7':
          return { data: { success: true, data: user } }
        case '/api/user/7/oauth/bindings':
          return { data: { success: true, data: [] } }
        case '/api/status':
          return {
            data: {
              success: true,
              data: {
                github_oauth: true,
                discord_oauth: true,
                wechat_login: true,
                oidc_enabled: true,
                telegram_oauth: true,
                linuxdo_oauth: true,
              },
            },
          }
        default:
          throw new Error(`Unexpected GET ${url}`)
      }
    }
    apiClient.delete = async (url) => {
      deletedUrls.push(url)
      return { data: { success: true, message: 'success' } }
    }

    render(<UserBindingDialog open userId={7} onOpenChange={() => undefined} />)

    const expectedBindings = [
      ['Email', 'email'],
      ['GitHub', 'github'],
      ['Discord', 'discord'],
      ['WeChat', 'wechat'],
      ['OIDC', 'oidc'],
      ['Telegram', 'telegram'],
      ['LinuxDO', 'linuxdo'],
    ] as const

    await screen.findByText('bound-user (ID: 7)')
    for (const [provider, bindingType] of expectedBindings) {
      await interaction.click(findUnbindButton(provider))
      await interaction.click(
        screen.getByRole('button', { name: 'Confirm Unbind' })
      )
      await waitFor(() => {
        expect(deletedUrls.at(-1)).toBe(`/api/user/7/bindings/${bindingType}`)
      })
      await waitFor(() => {
        expect(
          screen.queryByRole('button', { name: 'Confirm Unbind' })
        ).not.toBeInTheDocument()
      })
    }

    expect(deletedUrls).toHaveLength(expectedBindings.length)
  })

  test.each([true, false])(
    'displays custom provider_user_id and unbinds numeric provider_id when provider enabled is %s',
    async (enabled) => {
      const interaction = userEvent.setup()
      const deletedUrls: string[] = []
      apiClient.get = async (url) => {
        if (url === '/api/user/7') {
          return { data: { success: true, data: user } }
        }
        if (url === '/api/user/7/oauth/bindings') {
          return {
            data: {
              success: true,
              data: [
                {
                  provider_id: 12,
                  provider_name: 'Company SSO',
                  provider_slug: 'company',
                  provider_icon: '',
                  provider_user_id: 'employee-42',
                },
              ],
            },
          }
        }
        if (url === '/api/status') {
          return {
            data: {
              success: true,
              data: {
                custom_oauth_providers: enabled
                  ? [{ id: 12, name: 'Company SSO' }]
                  : [],
              },
            },
          }
        }
        throw new Error(`Unexpected GET ${url}`)
      }
      apiClient.delete = async (url) => {
        deletedUrls.push(url)
        return { data: { success: true } }
      }
      render(
        <UserBindingDialog open userId={7} onOpenChange={() => undefined} />
      )
      const group = await screen.findByRole('group', { name: 'Company SSO' })
      expect(within(group).getByText('employee-42')).toBeVisible()
      await interaction.click(
        within(group).getByRole('button', { name: 'Unbind' })
      )
      await interaction.click(
        screen.getByRole('button', { name: 'Confirm Unbind' })
      )
      await waitFor(() =>
        expect(deletedUrls).toEqual(['/api/user/7/oauth/bindings/12'])
      )
    }
  )
})
