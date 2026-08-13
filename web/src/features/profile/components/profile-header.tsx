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
import { Activity, BarChart3, Loader2, Pencil, WalletCards } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { IconBadge, type IconBadgeTone } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCompactNumber, formatQuota } from '@/lib/format'
import { getRoleLabel } from '@/lib/roles'

import { getDisplayName } from '../lib'
import type { UserProfile } from '../types'
import { ProfileAvatarControl } from './profile-avatar-control'

// ============================================================================
// Profile Header Component
// ============================================================================

interface ProfileHeaderProps {
  profile: UserProfile | null
  loading: boolean
  updating: boolean
  onUpdateDisplayName: (displayName: string) => Promise<boolean>
  avatarUpdating: boolean
  onUploadAvatar: (file: File) => Promise<boolean>
  onRemoveAvatar: () => Promise<boolean>
}

export function ProfileHeader(props: ProfileHeaderProps) {
  const { t } = useTranslation()
  const [editOpen, setEditOpen] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)

  if (props.loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardContent className='p-4 sm:p-5'>
          <div className='flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left'>
            <Skeleton className='h-16 w-16 rounded-2xl' />
            <div className='space-y-3'>
              <div className='flex flex-col items-center gap-2 sm:flex-row sm:justify-start'>
                <Skeleton className='h-8 w-48' />
                <Skeleton className='h-5 w-16' />
              </div>
              <div className='flex flex-col items-center gap-1 sm:flex-row sm:justify-start sm:gap-4'>
                <Skeleton className='h-4 w-24' />
                <Skeleton className='h-4 w-40' />
                <Skeleton className='h-4 w-20' />
              </div>
            </div>
          </div>
        </CardContent>
        <div className='border-t'>
          <div className='divide-border/60 grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0'>
            {['balance', 'usage', 'requests'].map((key) => (
              <div key={key} className='px-4 py-3.5 sm:px-5 sm:py-4'>
                <Skeleton className='h-3.5 w-20' />
                <Skeleton className='mt-2 h-7 w-28' />
                <Skeleton className='mt-1.5 h-3.5 w-24' />
              </div>
            ))}
          </div>
        </div>
      </Card>
    )
  }

  if (!props.profile) return null

  const profile = props.profile
  const displayName = getDisplayName(profile)
  const roleLabel = getRoleLabel(profile.role)
  const stats: {
    label: string
    value: string
    description: string
    icon: typeof WalletCards
    tone: IconBadgeTone
  }[] = [
    {
      label: t('Current Balance'),
      value: formatQuota(profile.quota),
      description: t('Remaining quota'),
      icon: WalletCards,
      tone: 'success',
    },
    {
      label: t('Total Usage'),
      value: formatQuota(profile.used_quota),
      description: t('Total consumed quota'),
      icon: BarChart3,
      tone: 'info',
    },
    {
      label: t('API Requests'),
      value: formatCompactNumber(profile.request_count),
      description: t('Total requests made'),
      icon: Activity,
      tone: 'chart-4',
    },
  ]

  const openEdit = () => {
    setDisplayNameInput(profile.display_name || '')
    setDisplayNameError(null)
    setEditOpen(true)
  }

  const saveDisplayName = async () => {
    const value = displayNameInput.trim()
    if (!value) {
      setDisplayNameError(t('Please enter a name'))
      return
    }
    if ([...value].length > 20) {
      setDisplayNameError(t('Display name must be 20 characters or fewer'))
      return
    }
    const updated = await props.onUpdateDisplayName(value)
    if (updated) setEditOpen(false)
  }

  return (
    <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
      <CardContent className='p-3 sm:p-5'>
        <div className='flex items-center gap-3 text-left sm:gap-4'>
          <ProfileAvatarControl
            name={profile.username || displayName}
            avatarUrl={profile.avatar_url}
            updating={props.avatarUpdating}
            onUpload={props.onUploadAvatar}
            onRemove={props.onRemoveAvatar}
          />

          <div className='min-w-0 flex-1 space-y-1.5 sm:space-y-3'>
            <div className='flex min-w-0 items-center gap-2'>
              <h1 className='truncate text-xl font-semibold tracking-tight sm:text-2xl'>
                {displayName}
              </h1>
              <StatusBadge
                label={roleLabel}
                variant='neutral'
                copyable={false}
              />
              <StatusBadge
                label={`${t('User ID')} ${profile.id}`}
                variant='info'
                copyText={String(profile.id)}
              />
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                onClick={openEdit}
                aria-label={t('Edit')}
              >
                <Pencil className='h-4 w-4' />
              </Button>
            </div>

            <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:gap-x-4 sm:text-sm'>
              <span className='truncate'>@{profile.username}</span>
              {profile.email && (
                <>
                  <span>•</span>
                  <span className='truncate'>{profile.email}</span>
                </>
              )}
              {profile.group && (
                <>
                  <span>•</span>
                  <span className='truncate'>{profile.group}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
      <div className='border-t'>
        <div className='divide-border/60 grid grid-cols-3 divide-x'>
          {stats.map((item) => (
            <div key={item.label} className='min-w-0 px-3 py-3 sm:px-5 sm:py-4'>
              <div className='flex items-center gap-2'>
                <IconBadge tone={item.tone} size='stat'>
                  <item.icon />
                </IconBadge>
                <div className='text-muted-foreground truncate text-xs font-medium tracking-wider uppercase'>
                  {item.label}
                </div>
              </div>

              <div className='text-foreground mt-1.5 truncate font-mono text-lg font-bold tracking-tight tabular-nums sm:mt-2 sm:text-2xl'>
                {item.value}
              </div>
              <div className='text-muted-foreground/60 mt-1 hidden text-xs md:block'>
                {item.description}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Dialog
        open={editOpen}
        onOpenChange={(next) => {
          setEditOpen(next)
          if (!next) setDisplayNameError(null)
        }}
        title={t('Edit profile')}
        description={t('Update the name shown across your account.')}
        contentClassName='sm:max-w-md'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              disabled={props.updating}
              onClick={() => setEditOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              disabled={props.updating}
              onClick={() => void saveDisplayName()}
            >
              {props.updating && <Loader2 className='h-4 w-4 animate-spin' />}
              {t('Save changes')}
            </Button>
          </>
        }
      >
        <div className='space-y-2'>
          <Label htmlFor='profile-display-name'>{t('Display Name')}</Label>
          <Input
            id='profile-display-name'
            value={displayNameInput}
            maxLength={20}
            aria-invalid={Boolean(displayNameError)}
            aria-describedby={
              displayNameError ? 'profile-display-name-error' : undefined
            }
            onChange={(event) => {
              setDisplayNameInput(event.target.value)
              if (displayNameError) setDisplayNameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !props.updating) {
                event.preventDefault()
                void saveDisplayName()
              }
            }}
          />
          {displayNameError && (
            <p
              id='profile-display-name-error'
              className='text-destructive text-sm'
            >
              {displayNameError}
            </p>
          )}
        </div>
      </Dialog>
    </Card>
  )
}
