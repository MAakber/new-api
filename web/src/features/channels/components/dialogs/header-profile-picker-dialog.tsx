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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Pencil, Plus, RefreshCw, Stethoscope } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  getNpmVersionDiagnostics,
  getNpmVersionOptions,
  refreshNpmVersionOptions,
} from '../../api'
import {
  HEADER_PROFILE_DEFAULT_PLATFORM,
  HEADER_PROFILE_GROUPS,
  HEADER_PROFILE_LATEST_ALIAS,
  HEADER_PROFILE_PLATFORM_OPTIONS,
  HEADER_PROFILE_PRESETS,
  baseHeaderProfileId,
  buildHeaderProfileId,
  buildHeaderProfileSnapshot,
  getHeaderProfileVersionSource,
  headerProfileVersionFromId,
  supportsHeaderProfilePlatform,
  supportsHeaderProfileVersioning,
  type HeaderProfile,
  type HeaderProfileCategory,
  type HeaderProfileMode,
} from '../../lib/header-profile'
import { HeaderProfileEditorDialog } from './header-profile-editor-dialog'

export type HeaderProfilePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: HeaderProfileMode
  selectedIds: string[]
  customProfiles: HeaderProfile[]
  onSave: (selectedIds: string[], snapshots: HeaderProfile[]) => void
  /** 1M context is an independent capability toggle shown alongside diagnostics. */
  context1MEnabled?: boolean
  onContext1MChange?: (enabled: boolean) => void
  disabled?: boolean
}

const GROUP_LABELS: Record<HeaderProfileCategory, string> = {
  dynamic: 'Dynamic (protocol compatible)',
  static: 'Static (client identity only)',
  custom: 'Custom',
}

function formatTimestamp(value: number | undefined): string {
  if (!value) return ''
  const millis = value > 1e12 ? value : value * 1000
  return new Date(millis).toLocaleString()
}

/** Per-template version/platform selection, keyed by base profile id. */
type VersionSelection = Record<string, { version: string; platform: string }>

function buildInitialSelection(selectedIds: string[]): VersionSelection {
  const selection: VersionSelection = {}
  for (const id of selectedIds) {
    const baseId = baseHeaderProfileId(id)
    if (!supportsHeaderProfileVersioning(baseId)) continue
    selection[baseId] = {
      version: headerProfileVersionFromId(id),
      platform: HEADER_PROFILE_DEFAULT_PLATFORM,
    }
  }
  return selection
}

function VersionPicker(props: {
  baseProfileId: string
  version: string
  platform: string
  showPlatform: boolean
  onVersionChange: (version: string) => void
  onPlatformChange: (platform: string) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const source = getHeaderProfileVersionSource(props.baseProfileId)
  const packageName = source?.packageName ?? ''

  const versionQuery = useQuery({
    queryKey: ['channels', 'npm-version-options', packageName],
    queryFn: () => getNpmVersionOptions(packageName),
    enabled: Boolean(packageName),
    staleTime: 5 * 60 * 1000,
  })

  const refreshMutation = useMutation({
    mutationFn: () => refreshNpmVersionOptions(packageName),
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to refresh versions'))
        return
      }
      queryClient.setQueryData(
        ['channels', 'npm-version-options', packageName],
        response
      )
      toast.success(t('Versions refreshed'))
    },
    onError: () => toast.error(t('Failed to refresh versions')),
  })

  const lookup = versionQuery.data?.success ? versionQuery.data.data : undefined
  const latestVersion = lookup?.latest_version ?? source?.fallbackVersion ?? ''
  const fetchedAt = formatTimestamp(lookup?.fetched_at)

  // `latest` always tracks the newest published version; pinned versions come
  // from the cached npm option list.
  const versionOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      {
        value: HEADER_PROFILE_LATEST_ALIAS,
        label: latestVersion
          ? `${HEADER_PROFILE_LATEST_ALIAS} (${latestVersion})`
          : HEADER_PROFILE_LATEST_ALIAS,
      },
    ]
    for (const option of lookup?.options ?? []) {
      const value = option.value || option.version
      if (!value || value === HEADER_PROFILE_LATEST_ALIAS) continue
      options.push({ value, label: option.label || value })
    }
    return options
  }, [latestVersion, lookup?.options])

  // SelectValue echoes the raw value, so render the label explicitly to keep
  // showing "latest (0.148.0)" instead of just "latest".
  const selectedVersionLabel =
    versionOptions.find((option) => option.value === props.version)?.label ??
    props.version
  const selectedPlatformLabel =
    HEADER_PROFILE_PLATFORM_OPTIONS.find(
      (option) => option.value === props.platform
    )?.label ?? props.platform

  return (
    <div className='flex shrink-0 flex-col items-end gap-1.5'>
      <div className='flex items-center gap-1.5'>
        <Select
          value={props.version}
          onValueChange={(value) => value && props.onVersionChange(value)}
        >
          <SelectTrigger
            className='h-8 w-[150px] text-xs'
            aria-label={t('Client version')}
          >
            <SelectValue>{selectedVersionLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {versionOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className='size-8'
          disabled={refreshMutation.isPending || !packageName}
          onClick={(event) => {
            event.stopPropagation()
            refreshMutation.mutate()
          }}
          aria-label={t('Refresh versions')}
        >
          {refreshMutation.isPending ? (
            <Loader2 className='h-3.5 w-3.5 animate-spin' />
          ) : (
            <RefreshCw className='h-3.5 w-3.5' />
          )}
        </Button>
      </div>
      {props.showPlatform ? (
        <Select
          value={props.platform}
          onValueChange={(value) => value && props.onPlatformChange(value)}
        >
          <SelectTrigger
            className='h-8 w-[150px] text-xs'
            aria-label={t('Client platform')}
          >
            <SelectValue>{selectedPlatformLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {HEADER_PROFILE_PLATFORM_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {fetchedAt ? (
        <span className='text-muted-foreground text-[11px]'>
          {t('Cached, refreshed at {{time}}', { time: fetchedAt })}
        </span>
      ) : null}
    </div>
  )
}

export function HeaderProfilePickerDialog(
  props: HeaderProfilePickerDialogProps
) {
  const { t } = useTranslation()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [versionSelection, setVersionSelection] = useState<VersionSelection>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState<HeaderProfile | null>(
    null
  )

  useEffect(() => {
    if (!props.open) return
    setSelectedIds(props.selectedIds)
    setVersionSelection(buildInitialSelection(props.selectedIds))
  }, [props.open, props.selectedIds])

  const diagnosticsMutation = useMutation({
    mutationFn: getNpmVersionDiagnostics,
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Diagnostics unavailable'))
        return
      }
      toast.success(t('npm version cache is reachable'))
    },
    onError: () => toast.error(t('Diagnostics unavailable')),
  })

  const allProfiles = useMemo<HeaderProfile[]>(
    () => [...Object.values(HEADER_PROFILE_PRESETS), ...props.customProfiles],
    [props.customProfiles]
  )

  const groupedProfiles = useMemo(() => {
    return HEADER_PROFILE_GROUPS.map((group) => ({
      ...group,
      profiles: allProfiles.filter(
        (profile) => (profile.category ?? 'custom') === group.key
      ),
    })).filter((group) => group.profiles.length > 0)
  }, [allProfiles])

  const getSelection = (baseId: string) =>
    versionSelection[baseId] ?? {
      version: HEADER_PROFILE_LATEST_ALIAS,
      platform: HEADER_PROFILE_DEFAULT_PLATFORM,
    }

  /**
   * Fixed mode holds a single template, so clicking replaces the selection.
   * Rotation modes accumulate templates and clicking toggles membership.
   */
  const toggleProfile = (profile: HeaderProfile) => {
    const baseId = baseHeaderProfileId(profile.id)
    const selection = getSelection(baseId)
    const profileId = supportsHeaderProfileVersioning(baseId)
      ? buildHeaderProfileId(baseId, selection.version)
      : profile.id

    if (props.mode === 'fixed') {
      setSelectedIds([profileId])
      return
    }
    setSelectedIds((current) => {
      const withoutBase = current.filter(
        (id) => baseHeaderProfileId(id) !== baseId
      )
      return withoutBase.length === current.length
        ? [...current, profileId]
        : withoutBase
    })
  }

  const isSelected = (profile: HeaderProfile) => {
    const baseId = baseHeaderProfileId(profile.id)
    return selectedIds.some((id) => baseHeaderProfileId(id) === baseId)
  }

  const updateSelection = (
    baseId: string,
    patch: { version?: string; platform?: string }
  ) => {
    const next = { ...getSelection(baseId), ...patch }
    setVersionSelection((current) => ({ ...current, [baseId]: next }))
    // Keep an already-selected template's id in sync with the picked version.
    setSelectedIds((current) =>
      current.map((id) =>
        baseHeaderProfileId(id) === baseId
          ? buildHeaderProfileId(baseId, next.version)
          : id
      )
    )
  }

  const handleSave = () => {
    const snapshots: HeaderProfile[] = []
    for (const id of selectedIds) {
      const baseId = baseHeaderProfileId(id)
      const custom = props.customProfiles.find(
        (profile) => profile.id === id || profile.id === baseId
      )
      if (custom) {
        snapshots.push({ ...custom, id })
        continue
      }
      const selection = getSelection(baseId)
      const snapshot = buildHeaderProfileSnapshot(
        baseId,
        selection.version,
        selection.platform
      )
      if (snapshot) snapshots.push(snapshot)
    }
    props.onSave(selectedIds, snapshots)
    props.onOpenChange(false)
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Select Client Template')}
      description={
        props.mode === 'fixed'
          ? t(
              'Click a template to replace the current selection. Fixed mode uses exactly one template.'
            )
          : t(
              'Click templates to add or remove them. Rotation uses all selected templates.'
            )
      }
      contentClassName='sm:max-w-4xl'
      contentHeight='min(64vh, 640px)'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={handleSave}>
            {t('Done')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='bg-muted/40 flex items-start justify-between gap-3 rounded-lg p-3'>
          <p className='text-muted-foreground text-xs leading-relaxed'>
            {t(
              'Dynamic templates present an official client identity and require pass_headers in the advanced request rules. Static templates only pin the client identity.'
            )}
          </p>
          <div className='flex shrink-0 flex-col items-end gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => diagnosticsMutation.mutate()}
              disabled={diagnosticsMutation.isPending}
            >
              {diagnosticsMutation.isPending ? (
                <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
              ) : (
                <Stethoscope className='mr-1.5 h-3.5 w-3.5' />
              )}
              {t('npm Diagnostics')}
            </Button>
            <Button
              type='button'
              size='sm'
              variant='outline'
              disabled={props.disabled}
              onClick={() => {
                setEditingProfile(null)
                setEditorOpen(true)
              }}
            >
              <Plus className='mr-1.5 h-3.5 w-3.5' />
              {t('New Custom Template')}
            </Button>
            {props.onContext1MChange ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className='flex items-center gap-2 whitespace-nowrap' />
                  }
                >
                  <Label
                    htmlFor='header-profile-context-1m'
                    className='text-muted-foreground cursor-pointer text-xs'
                  >
                    {t('Enable 1M context')}
                  </Label>
                  <Switch
                    id='header-profile-context-1m'
                    checked={props.context1MEnabled === true}
                    disabled={props.disabled}
                    onCheckedChange={props.onContext1MChange}
                    aria-label={t('Enable 1M context')}
                  />
                </TooltipTrigger>
                <TooltipContent className='max-w-xs text-xs'>
                  {t(
                    'Adds the Claude 1M context beta token to anthropic-beta. Anthropic channels only, and the account must be eligible for 1M context.'
                  )}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        {groupedProfiles.map((group) => (
          <div key={group.key} className='flex flex-col gap-2'>
            <div className='text-muted-foreground text-xs font-semibold'>
              {t(GROUP_LABELS[group.key])}
            </div>
            <div className='grid gap-3 lg:grid-cols-2'>
              {group.profiles.map((profile) => {
                const baseId = baseHeaderProfileId(profile.id)
                const selected = isSelected(profile)
                const versioned = supportsHeaderProfileVersioning(baseId)
                const selection = getSelection(baseId)
                const headerPreview = Object.entries(profile.headers)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')

                return (
                  <div
                    key={profile.id}
                    className={cn(
                      'border-border/60 hover:border-primary/50 flex flex-col gap-2 rounded-lg border p-3 text-left transition-colors',
                      selected && 'border-primary bg-primary/5'
                    )}
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type='button'
                              onClick={() => toggleProfile(profile)}
                              className='min-w-0 flex-1 text-left'
                              aria-pressed={selected}
                            />
                          }
                        >
                          <div className='flex items-center gap-2'>
                            <span className='truncate text-[13px] font-semibold'>
                              {profile.name}
                            </span>
                            {selected ? (
                              <Check className='text-primary h-3.5 w-3.5 shrink-0' />
                            ) : null}
                          </div>
                          {profile.passthrough_required ? (
                            <Badge
                              variant='outline'
                              className='mt-1 text-[10px]'
                            >
                              {t('Requires pass_headers')}
                            </Badge>
                          ) : null}
                        </TooltipTrigger>
                        <TooltipContent className='max-w-lg text-left font-mono text-[11px] whitespace-pre-wrap'>
                          {headerPreview}
                        </TooltipContent>
                      </Tooltip>
                      {versioned ? (
                        <VersionPicker
                          baseProfileId={baseId}
                          version={selection.version}
                          platform={selection.platform}
                          showPlatform={supportsHeaderProfilePlatform(baseId)}
                          onVersionChange={(version) =>
                            updateSelection(baseId, { version })
                          }
                          onPlatformChange={(platform) =>
                            updateSelection(baseId, { platform })
                          }
                        />
                      ) : null}
                      {/* Only user-defined templates can be edited. */}
                      {profile.scope === 'user' ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='size-8 shrink-0'
                          disabled={props.disabled}
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditingProfile(profile)
                            setEditorOpen(true)
                          }}
                          aria-label={t('Edit Custom Template')}
                        >
                          <Pencil className='h-3.5 w-3.5' />
                        </Button>
                      ) : null}
                    </div>
                    {profile.description ? (
                      <p className='text-muted-foreground text-[11px] leading-relaxed'>
                        {profile.description}
                      </p>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <HeaderProfileEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        profile={editingProfile}
        existingProfiles={props.customProfiles}
      />
    </Dialog>
  )
}
