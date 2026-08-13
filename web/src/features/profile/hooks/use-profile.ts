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
import { t } from 'i18next'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'

import { useAuthStore } from '@/stores/auth-store'

import {
  deleteUserAvatar,
  getUserProfile,
  updateUserProfile,
  updateUserSettings,
  uploadUserAvatar,
} from '../api'
import type {
  UserProfile,
  UpdateUserRequest,
  UpdateUserSettingsRequest,
} from '../types'

// ============================================================================
// Profile Hook
// ============================================================================

export function useProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [avatarUpdating, setAvatarUpdating] = useState(false)
  const setAuthUser = useAuthStore((state) => state.auth.setUser)

  const syncAuthUser = useCallback(
    (nextProfile: UserProfile) => {
      const currentUser = useAuthStore.getState().auth.user
      if (!currentUser || currentUser.id !== nextProfile.id) return

      setAuthUser({
        ...currentUser,
        username: nextProfile.username,
        avatar_url: nextProfile.avatar_url,
        display_name: nextProfile.display_name,
        email: nextProfile.email,
        role: nextProfile.role,
        status: nextProfile.status,
        group: nextProfile.group,
        quota: nextProfile.quota,
        used_quota: nextProfile.used_quota,
        request_count: nextProfile.request_count,
        aff_code: nextProfile.aff_code,
        aff_count: nextProfile.aff_count,
        aff_quota: nextProfile.aff_quota,
        aff_history_quota: nextProfile.aff_history_quota,
        inviter_id: nextProfile.invite_user_id,
        github_id: nextProfile.github_id,
        discord_id: nextProfile.discord_id,
        oidc_id: nextProfile.oidc_id,
        wechat_id: nextProfile.wechat_id,
        telegram_id: nextProfile.telegram_id,
        linux_do_id: nextProfile.linux_do_id,
        setting: nextProfile.setting,
      })
    },
    [setAuthUser]
  )

  // Fetch user profile (with optional silent mode)
  const fetchProfile = useCallback(
    async (silent = false) => {
      try {
        if (!silent) {
          setLoading(true)
        }
        const response = await getUserProfile()

        if (response.success && response.data) {
          const nextProfile: UserProfile = {
            ...response.data,
            avatar_url: response.data.avatar_url ?? '',
          }
          setProfile(nextProfile)
          syncAuthUser(nextProfile)
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to fetch profile:', error)
        if (!silent) {
          toast.error(t('Failed to load profile'))
        }
      } finally {
        if (!silent) {
          setLoading(false)
        }
      }
    },
    [syncAuthUser]
  )

  // Refresh profile silently (without loading state)
  const refreshProfile = useCallback(async () => {
    await fetchProfile(true)
  }, [fetchProfile])

  // Upload a profile avatar and refresh both profile surfaces.
  const uploadAvatar = useCallback(
    async (file: File): Promise<boolean> => {
      try {
        setAvatarUpdating(true)
        const response = await uploadUserAvatar(file)

        if (response.success) {
          if (response.data?.avatar_url) {
            setProfile((currentProfile) =>
              currentProfile
                ? {
                    ...currentProfile,
                    avatar_url: response.data?.avatar_url ?? '',
                  }
                : currentProfile
            )
            const currentUser = useAuthStore.getState().auth.user
            if (currentUser) {
              setAuthUser({
                ...currentUser,
                avatar_url: response.data.avatar_url,
              })
            }
          }
          toast.success(t('Avatar updated successfully'))
          await refreshProfile()
          return true
        }

        toast.error(response.message || t('Failed to update avatar'))
        return false
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update avatar:', error)
        toast.error(t('Failed to update avatar'))
        return false
      } finally {
        setAvatarUpdating(false)
      }
    },
    [refreshProfile, setAuthUser]
  )

  // Remove the profile avatar and refresh both profile surfaces.
  const removeAvatar = useCallback(async (): Promise<boolean> => {
    try {
      setAvatarUpdating(true)
      const response = await deleteUserAvatar()

      if (response.success) {
        setProfile((currentProfile) =>
          currentProfile
            ? { ...currentProfile, avatar_url: '' }
            : currentProfile
        )
        const currentUser = useAuthStore.getState().auth.user
        if (currentUser) {
          setAuthUser({ ...currentUser, avatar_url: '' })
        }
        toast.success(t('Avatar removed successfully'))
        await refreshProfile()
        return true
      }

      toast.error(response.message || t('Failed to remove avatar'))
      return false
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove avatar:', error)
      toast.error(t('Failed to remove avatar'))
      return false
    } finally {
      setAvatarUpdating(false)
    }
  }, [refreshProfile, setAuthUser])

  // Update user profile
  const updateProfile = useCallback(
    async (data: UpdateUserRequest): Promise<boolean> => {
      try {
        setUpdating(true)
        const response = await updateUserProfile(data)

        if (response.success) {
          toast.success(t('Profile updated successfully'))
          await refreshProfile() // Refresh profile silently
          return true
        }

        toast.error(response.message || t('Failed to update profile'))
        return false
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update profile:', error)
        toast.error(t('Failed to update profile'))
        return false
      } finally {
        setUpdating(false)
      }
    },
    [refreshProfile]
  )

  // Update user settings
  const updateSettings = useCallback(
    async (data: UpdateUserSettingsRequest): Promise<boolean> => {
      try {
        setUpdating(true)
        const response = await updateUserSettings(data)

        if (response.success) {
          toast.success(t('Settings updated successfully'))
          await refreshProfile() // Refresh profile silently
          return true
        }

        toast.error(response.message || t('Failed to update settings'))
        return false
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to update settings:', error)
        toast.error(t('Failed to update settings'))
        return false
      } finally {
        setUpdating(false)
      }
    },
    [refreshProfile]
  )

  // Initial fetch
  useEffect(() => {
    fetchProfile()
  }, [fetchProfile])

  return {
    profile,
    loading,
    updating,
    avatarUpdating,
    fetchProfile,
    refreshProfile,
    updateProfile,
    updateSettings,
    uploadAvatar,
    removeAvatar,
  }
}
