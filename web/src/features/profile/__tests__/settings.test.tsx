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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { updateUserSettings } from '../api'
import { NotificationTab } from '../components/tabs/notification-tab'
import type { UserProfile } from '../types'

const profile: UserProfile = {
  id: 1,
  username: 'alice',
  display_name: 'Alice',
  avatar_url: '',
  role: 1,
  group: 'default',
  quota: 1000000,
  used_quota: 0,
  request_count: 0,
  status: 1,
  aff_count: 0,
  aff_quota: 0,
  aff_history_quota: 0,
  created_time: 0,
}
const settings = {
  notify_type: 'webhook',
  quota_warning_threshold: 1200,
  notification_email: '',
  webhook_url: 'https://example.com/notify',
  webhook_secret: 'webhook-secret',
  bark_url: '',
  gotify_url: '',
  gotify_token: '',
  gotify_priority: 5,
  accept_unset_model_ratio_model: true,
  upstream_model_update_notify_enabled: true,
}

afterEach(() => vi.restoreAllMocks())

describe('partial user settings saves', () => {
  it('updating a notification field sends the latest complete settings', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: { ...profile, setting: JSON.stringify(settings) },
      },
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    await updateUserSettings({ gotify_priority: 3 })
    expect(get).toHaveBeenCalledWith('/api/user/self')
    expect(put).toHaveBeenCalledWith('/api/user/setting', {
      ...settings,
      gotify_priority: 3,
    })
  })

  it('updating a user with no settings supplies the existing defaults', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: profile },
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    await updateUserSettings({ notification_email: 'alice@example.com' })
    expect(put).toHaveBeenCalledWith('/api/user/setting', {
      notify_type: 'email',
      quota_warning_threshold: 500000,
      notification_email: 'alice@example.com',
      webhook_url: '',
      webhook_secret: '',
      bark_url: '',
      gotify_url: '',
      gotify_token: '',
      gotify_priority: 5,
      accept_unset_model_ratio_model: false,
      upstream_model_update_notify_enabled: false,
    })
  })

  it('successive partial saves retain the latest values of other fields', async () => {
    let saved = { ...settings }
    vi.spyOn(api, 'get').mockImplementation(async () => ({
      data: {
        success: true,
        data: { ...profile, setting: JSON.stringify(saved) },
      },
    }))
    vi.spyOn(api, 'put').mockImplementation(async (_url, body) => {
      saved = body as typeof settings
      return { data: { success: true } }
    })
    await updateUserSettings({ upstream_model_update_notify_enabled: false })
    await updateUserSettings({ quota_warning_threshold: 2500 })
    await updateUserSettings({ gotify_priority: 3 })
    expect(saved).toEqual({
      ...settings,
      quota_warning_threshold: 2500,
      upstream_model_update_notify_enabled: false,
      gotify_priority: 3,
    })
  })

  it('a rejected profile read prevents the settings write', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'))
    const put = vi.spyOn(api, 'put')
    await expect(updateUserSettings({ gotify_priority: 3 })).rejects.toThrow(
      'offline'
    )
    expect(put).not.toHaveBeenCalled()
  })

  it('an unsuccessful profile response prevents the settings write', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: false, message: 'Unavailable' },
    })
    const put = vi.spyOn(api, 'put')
    expect(await updateUserSettings({ gotify_priority: 3 })).toEqual({
      success: false,
      message: 'Unavailable',
    })
    expect(put).not.toHaveBeenCalled()
  })

  it('an unsuccessful settings write is returned to the caller', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: profile },
    })
    vi.spyOn(api, 'put').mockResolvedValue({
      data: { success: false, message: 'Save failed' },
    })
    expect(await updateUserSettings({ gotify_priority: 3 })).toEqual({
      success: false,
      message: 'Save failed',
    })
  })

  it('notification edits never submit the obsolete IP recording preference', async () => {
    const onUpdate = vi.fn()
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          ...profile,
          setting: JSON.stringify({ ...settings, record_ip_log: false }),
        },
      },
    })
    const put = vi
      .spyOn(api, 'put')
      .mockResolvedValue({ data: { success: true } })
    render(
      <NotificationTab
        profile={{ ...profile, setting: JSON.stringify(settings) }}
        onUpdate={onUpdate}
      />
    )
    expect(
      screen.queryByRole('switch', { name: 'Record IP Address' })
    ).not.toBeInTheDocument()
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Quota Warning Threshold' }),
      { target: { value: '2700' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalled())
    expect(put).toHaveBeenCalledWith('/api/user/setting', {
      ...settings,
      quota_warning_threshold: 2700,
    })
  })
})
