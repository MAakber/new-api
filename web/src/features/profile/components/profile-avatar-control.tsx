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
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { AuthenticatedAvatarImage } from '@/components/authenticated-avatar-image'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'

const MAX_AVATAR_SIZE = 5 * 1024 * 1024
const ACCEPTED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

interface ProfileAvatarControlProps {
  name: string
  avatarUrl: string
  updating: boolean
  onUpload: (file: File) => Promise<boolean>
  onRemove: () => Promise<boolean>
}

export function ProfileAvatarControl(props: ProfileAvatarControlProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [])

  const avatarName = props.name
  const avatarFallback = getUserAvatarFallback(avatarName)
  const avatarFallbackStyle = getUserAvatarStyle(avatarName)

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!ACCEPTED_AVATAR_TYPES.has(file.type)) {
      toast.error(t('Please choose a JPEG, PNG, or WebP image'))
      return
    }
    if (file.size > MAX_AVATAR_SIZE) {
      toast.error(t('Avatar images must be 5 MiB or smaller'))
      return
    }

    const nextPreviewUrl = URL.createObjectURL(file)
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
    const uploaded = await props.onUpload(file)
    if (uploaded && previewUrlRef.current === nextPreviewUrl) {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
      setPreviewUrl(null)
    }
  }

  const handleRemove = async () => {
    const removed = await props.onRemove()
    if (!removed) return
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = null
    setPreviewUrl(null)
    setRemoveOpen(false)
  }

  return (
    <div className='group/avatar-control relative shrink-0'>
      <Avatar className='ring-background h-12 w-12 rounded-full text-sm ring-2 sm:h-16 sm:w-16 sm:text-lg sm:ring-4'>
        {previewUrl ? (
          <AvatarImage src={previewUrl} alt={t('Profile avatar')} />
        ) : (
          <AuthenticatedAvatarImage
            avatarUrl={props.avatarUrl}
            alt={t('Profile avatar')}
          />
        )}
        <AvatarFallback
          className='rounded-full font-semibold text-white'
          style={avatarFallbackStyle}
        >
          {avatarFallback}
        </AvatarFallback>
      </Avatar>
      <TooltipProvider delay={300}>
        <div
          data-avatar-actions
          className='border-border/80 bg-background/95 pointer-events-none absolute -right-2 -bottom-2 z-10 flex translate-y-1 items-center gap-1 rounded-xl border p-1 opacity-0 shadow-md backdrop-blur-sm transition-[opacity,transform] duration-200 group-focus-within/avatar-control:pointer-events-auto group-focus-within/avatar-control:translate-y-0 group-focus-within/avatar-control:opacity-100 group-hover/avatar-control:pointer-events-auto group-hover/avatar-control:translate-y-0 group-hover/avatar-control:opacity-100 motion-reduce:transition-none [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100'
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type='button'
                  variant='secondary'
                  size='icon-sm'
                  disabled={props.updating}
                  onClick={() => inputRef.current?.click()}
                  aria-label={
                    props.avatarUrl ? t('Replace avatar') : t('Upload avatar')
                  }
                />
              }
            >
              {props.updating ? (
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              ) : (
                <ImagePlus className='size-4' aria-hidden='true' />
              )}
            </TooltipTrigger>
            <TooltipContent>
              {props.avatarUrl ? t('Replace avatar') : t('Upload avatar')}
            </TooltipContent>
          </Tooltip>
          {props.avatarUrl && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type='button'
                    variant='ghost'
                    size='icon-sm'
                    disabled={props.updating}
                    onClick={() => setRemoveOpen(true)}
                    aria-label={t('Remove avatar')}
                    className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                  />
                }
              >
                <Trash2 className='size-4' aria-hidden='true' />
              </TooltipTrigger>
              <TooltipContent>{t('Remove avatar')}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
      <input
        ref={inputRef}
        type='file'
        accept='image/jpeg,image/png,image/webp'
        className='sr-only'
        aria-label={t('Choose an avatar image')}
        onChange={(event) => void handleFileChange(event)}
      />
      <ConfirmDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={t('Remove profile avatar?')}
        desc={t('Your initials will be shown until you upload a new avatar.')}
        confirmText={t('Remove avatar')}
        destructive
        isLoading={props.updating}
        handleConfirm={() => void handleRemove()}
      />
    </div>
  )
}
