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
import { useQuery } from '@tanstack/react-query'
import { Settings2, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { listUserHeaderProfiles } from '../../../api'
import type { ChannelFormValues } from '../../../lib/channel-form'
import {
  baseHeaderProfileId,
  resolveHeaderProfile,
  validateHeaderProfileStrategy,
  type HeaderProfile,
  type HeaderProfileMode,
} from '../../../lib/header-profile'
import { HeaderProfilePickerDialog } from '../../dialogs/header-profile-picker-dialog'

type ChannelHeaderProfileSectionProps = {
  control: Control<ChannelFormValues>
  setValue: UseFormSetValue<ChannelFormValues>
  disabled: boolean
  onOpenAdvanced?: () => void
}

const MODE_OPTIONS: Array<{ value: HeaderProfileMode; labelKey: string }> = [
  { value: 'fixed', labelKey: 'Fixed' },
  { value: 'round_robin', labelKey: 'Round Robin' },
  { value: 'random', labelKey: 'Random' },
]

export function ChannelHeaderProfileSection(
  props: ChannelHeaderProfileSectionProps
) {
  const { t } = useTranslation()
  const [pickerOpen, setPickerOpen] = useState(false)

  const enabled = useWatch({
    control: props.control,
    name: 'header_profile_enabled',
  })
  const mode = useWatch({
    control: props.control,
    name: 'header_profile_mode',
  })
  const selectedIds = useWatch({
    control: props.control,
    name: 'header_profile_selected_ids',
  })
  const snapshotsRaw = useWatch({
    control: props.control,
    name: 'header_profile_snapshots',
  })
  const context1MEnabled = useWatch({
    control: props.control,
    name: 'client_identity_context_1m_enabled',
  })

  const effectiveMode: HeaderProfileMode = mode ?? 'fixed'
  // useWatch returns a new array instance on every render, so memoize on a
  // stable key to avoid re-running the derived selectors each render.
  const selectedIdsKey = (selectedIds ?? []).join('\u0000')
  const effectiveSelectedIds = useMemo(
    () => (selectedIdsKey ? selectedIdsKey.split('\u0000') : []),
    [selectedIdsKey]
  )

  // User-defined templates live on the user account, not the channel, so they
  // are fetched separately and merged into the picker list.
  const customProfilesQuery = useQuery({
    queryKey: ['user', 'header-profiles'],
    queryFn: listUserHeaderProfiles,
    staleTime: 5 * 60 * 1000,
  })

  const customProfiles = useMemo<HeaderProfile[]>(() => {
    if (!customProfilesQuery.data?.success) return []
    return customProfilesQuery.data.data ?? []
  }, [customProfilesQuery.data])

  const storedSnapshots = useMemo<HeaderProfile[]>(() => {
    if (!snapshotsRaw) return []
    try {
      const parsed = JSON.parse(snapshotsRaw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }, [snapshotsRaw])

  const selectedProfiles = useMemo(() => {
    return effectiveSelectedIds.map((id) => {
      const profile = resolveHeaderProfile(id, [
        ...storedSnapshots,
        ...customProfiles,
      ])
      return { id, name: profile?.name ?? baseHeaderProfileId(id) }
    })
  }, [customProfiles, effectiveSelectedIds, storedSnapshots])

  const validationError = validateHeaderProfileStrategy({
    enabled: Boolean(enabled),
    mode: effectiveMode,
    selected_profile_ids: effectiveSelectedIds,
  })

  const handleModeChange = (nextMode: HeaderProfileMode) => {
    props.setValue('header_profile_mode', nextMode, { shouldDirty: true })
    // Fixed mode only supports a single template, so trim any extras instead of
    // letting the channel fail validation on save.
    if (nextMode === 'fixed' && effectiveSelectedIds.length > 1) {
      const trimmed = effectiveSelectedIds.slice(0, 1)
      props.setValue('header_profile_selected_ids', trimmed, {
        shouldDirty: true,
      })
      props.setValue(
        'header_profile_snapshots',
        JSON.stringify(
          storedSnapshots.filter((profile) => trimmed.includes(profile.id))
        ),
        { shouldDirty: true }
      )
    }
  }

  const handleSaveSelection = (
    nextIds: string[],
    snapshots: HeaderProfile[]
  ) => {
    props.setValue('header_profile_selected_ids', nextIds, {
      shouldDirty: true,
    })
    props.setValue('header_profile_snapshots', JSON.stringify(snapshots), {
      shouldDirty: true,
    })
    // Selecting at least one template implicitly enables the strategy; clearing
    // the selection turns it back off so requests stay unmodified.
    props.setValue('header_profile_enabled', nextIds.length > 0, {
      shouldDirty: true,
    })
  }

  return (
    <div className='border-border/60 flex flex-col gap-3 rounded-lg border p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          <span className='bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md'>
            <ShieldCheck className='h-4 w-4' aria-hidden='true' />
          </span>
          <div className='flex flex-col gap-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <span className='text-[13px] font-semibold'>
                {t('Upstream Request Strategy')}
              </span>
              <Badge
                variant={enabled ? 'default' : 'outline'}
                className='text-[10px]'
              >
                {enabled
                  ? t('{{count}} template(s) selected', {
                      count: effectiveSelectedIds.length,
                    })
                  : t('Headers not enabled')}
              </Badge>
            </div>
            <p className='text-muted-foreground max-w-xl text-xs leading-relaxed'>
              {t(
                'Requests are unmodified by default. Pick a template only when you need to look like a browser or an AI client. Fixed mode uses one template; round robin and random can use several.'
              )}
            </p>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          <Button
            type='button'
            size='sm'
            disabled={props.disabled}
            onClick={() => setPickerOpen(true)}
          >
            {t('Select Template')}
          </Button>
          {props.onOpenAdvanced ? (
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={props.disabled}
              onClick={props.onOpenAdvanced}
            >
              <Settings2 className='mr-1.5 h-3.5 w-3.5' />
              {t('Advanced Request Rules')}
            </Button>
          ) : null}
        </div>
      </div>

      {enabled ? (
        <div className='flex flex-col gap-2 pl-11'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground text-xs'>{t('Mode')}</span>
            <Select
              value={effectiveMode}
              disabled={props.disabled}
              onValueChange={(value) =>
                value && handleModeChange(value as HeaderProfileMode)
              }
            >
              <SelectTrigger
                className='h-8 w-[150px] text-xs'
                aria-label={t('Mode')}
              >
                {/* SelectValue echoes the raw value, so render the translated
                    label explicitly. */}
                <SelectValue>
                  {t(
                    MODE_OPTIONS.find(
                      (option) => option.value === effectiveMode
                    )?.labelKey ?? effectiveMode
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                {MODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProfiles.length > 0 ? (
            <div className='flex flex-wrap gap-1.5'>
              {selectedProfiles.map((profile) => (
                <Badge
                  key={profile.id}
                  variant='secondary'
                  className='text-[11px]'
                >
                  {profile.name}
                </Badge>
              ))}
            </div>
          ) : null}
          {validationError ? (
            <p className='text-destructive text-xs'>{t(validationError)}</p>
          ) : null}
        </div>
      ) : null}

      <HeaderProfilePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode={effectiveMode}
        selectedIds={effectiveSelectedIds}
        customProfiles={customProfiles}
        onSave={handleSaveSelection}
        disabled={props.disabled}
        context1MEnabled={context1MEnabled === true}
        onContext1MChange={(checked) =>
          props.setValue('client_identity_context_1m_enabled', checked, {
            shouldDirty: true,
          })
        }
      />
    </div>
  )
}
