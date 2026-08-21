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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import { createUserHeaderProfile, updateUserHeaderProfile } from '../../api'
import {
  HEADER_PROFILE_DRAFT_EXAMPLE,
  validateHeaderProfileDraft,
  type HeaderProfile,
} from '../../lib/header-profile'

export type HeaderProfileEditorDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass an existing profile to edit it, or omit to create a new one. */
  profile?: HeaderProfile | null
  existingProfiles: HeaderProfile[]
  onSaved?: (profile: HeaderProfile) => void
}

function buildInitialDraft(profile: HeaderProfile | null | undefined) {
  if (!profile) {
    return { name: '', headersText: '', description: '' }
  }
  return {
    name: profile.name,
    headersText: JSON.stringify(profile.headers ?? {}, null, 2),
    description: profile.description ?? '',
  }
}

export function HeaderProfileEditorDialog(
  props: HeaderProfileEditorDialogProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const isEditing = Boolean(props.profile?.id)

  const [name, setName] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<{
    name?: string
    headersText?: string
  }>({})
  const [unsafeHeaderNames, setUnsafeHeaderNames] = useState<string[]>([])

  useEffect(() => {
    if (!props.open) return
    const draft = buildInitialDraft(props.profile)
    setName(draft.name)
    setHeadersText(draft.headersText)
    setDescription(draft.description)
    setErrors({})
    setUnsafeHeaderNames([])
  }, [props.open, props.profile])

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      headers: Record<string, string>
      description: string
    }) => {
      const body = { ...payload, category: 'custom' }
      return props.profile?.id
        ? updateUserHeaderProfile(props.profile.id, body)
        : createUserHeaderProfile(body)
    },
    onSuccess: (response) => {
      if (!response.success) {
        toast.error(response.message || t('Failed to save template'))
        return
      }
      toast.success(t('Template saved'))
      // The picker reads custom templates from this query.
      void queryClient.invalidateQueries({
        queryKey: ['user', 'header-profiles'],
      })
      if (response.data) props.onSaved?.(response.data)
      props.onOpenChange(false)
    },
    onError: () => toast.error(t('Failed to save template')),
  })

  const handleSave = () => {
    const validation = validateHeaderProfileDraft(
      { id: props.profile?.id, name, headersText, description },
      props.existingProfiles
    )
    setErrors(validation.errors)
    setUnsafeHeaderNames(validation.unsafeHeaderNames ?? [])
    if (!validation.isValid || !validation.parsedHeaders) return

    saveMutation.mutate({
      name: name.trim(),
      headers: validation.parsedHeaders,
      description: description.trim(),
    })
  }

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={isEditing ? t('Edit Custom Template') : t('New Custom Template')}
      description={t(
        'Define the request headers this template sends upstream. Credentials and transport headers are managed by the relay and cannot be set here.'
      )}
      contentClassName='sm:max-w-2xl'
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className='mr-1.5 h-3.5 w-3.5 animate-spin' />
            ) : null}
            {t('Save')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='header-profile-name'>{t('Name')}</Label>
          <Input
            id='header-profile-name'
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('For example: my internal gateway')}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name ? (
            <p className='text-destructive text-xs'>{t(errors.name)}</p>
          ) : null}
        </div>

        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='header-profile-headers'>{t('Headers JSON')}</Label>
          <Textarea
            id='header-profile-headers'
            value={headersText}
            onChange={(event) => setHeadersText(event.target.value)}
            placeholder={HEADER_PROFILE_DRAFT_EXAMPLE}
            className='min-h-[180px] font-mono text-xs'
            aria-invalid={Boolean(errors.headersText)}
          />
          {errors.headersText ? (
            <p className='text-destructive text-xs'>
              {t(errors.headersText, {
                headers: unsafeHeaderNames.join(', '),
              })}
            </p>
          ) : (
            <p className='text-muted-foreground text-xs'>
              {t(
                'A flat JSON object of header names to string values, for example {"User-Agent": "MyApp/1.0"}.'
              )}
            </p>
          )}
        </div>

        <div className='flex flex-col gap-1.5'>
          <Label htmlFor='header-profile-description'>
            {t('Description (optional)')}
          </Label>
          <Textarea
            id='header-profile-description'
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t('When to use this template')}
            className='min-h-[64px] text-xs'
          />
        </div>
      </div>
    </Dialog>
  )
}
