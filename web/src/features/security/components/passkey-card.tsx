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
import { KeyRound, Loader2, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { StatusBadge } from '@/components/status-badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { IconBadge } from '@/components/ui/icon-badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MAX_PASSKEY_NAME_LENGTH,
  MAX_PASSKEYS_PER_USER,
  usePasskeyManagement,
  validatePasskeyName,
  type PasskeyCredentialSummary,
  type PasskeyNameValidationError,
} from '@/features/auth/passkey'
import {
  SecureVerificationDialog,
  useSecureVerification,
  type VerificationMethod,
  type VerificationMethods,
} from '@/features/auth/secure-verification'
import dayjs from '@/lib/dayjs'

interface PasskeyCardProps {
  loading: boolean
}

function formatRelativeDate(
  value: string | null | undefined,
  fallback: string
) {
  if (!value || Number.isNaN(Date.parse(value))) return fallback
  return dayjs(value).fromNow()
}

export function PasskeyCard({ loading: pageLoading }: PasskeyCardProps) {
  const { t } = useTranslation()
  const [nameDialogOpen, setNameDialogOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [nameError, setNameError] = useState<PasskeyNameValidationError>(null)
  const [deleteTarget, setDeleteTarget] =
    useState<PasskeyCredentialSummary | null>(null)
  const [restrictedMethod, setRestrictedMethod] =
    useState<VerificationMethod | null>(null)

  const {
    credentials,
    loading,
    registering,
    removingId,
    supported,
    enabled,
    lastUsed,
    register,
    remove,
  } = usePasskeyManagement()

  const {
    open: verificationOpen,
    setOpen: setVerificationOpen,
    methods: verificationMethods,
    state: verificationState,
    startVerification,
    executeVerification,
    cancel: cancelVerification,
    setCode,
    switchMethod,
    fetchVerificationMethods,
  } = useSecureVerification({
    onSuccess: () => setRestrictedMethod(null),
  })

  const dialogMethods = useMemo<VerificationMethods>(() => {
    if (!restrictedMethod) return verificationMethods
    return {
      ...verificationMethods,
      has2FA: restrictedMethod === '2fa' && verificationMethods.has2FA,
      hasPasskey:
        restrictedMethod === 'passkey' && verificationMethods.hasPasskey,
    }
  }, [restrictedMethod, verificationMethods])

  const validationMessage = useMemo(() => {
    if (nameError === 'required') return t('Passkey name is required')
    if (nameError === 'too-long') {
      return t('Passkey name must be 64 characters or fewer')
    }
    if (nameError === 'duplicate') {
      return t('A Passkey with this name already exists')
    }
    return null
  }, [nameError, t])

  const performRegistration = useCallback(
    async (name: string, proofToken?: string) => {
      const registered = await register(name, proofToken)
      if (registered) {
        setNameDialogOpen(false)
        setDisplayName('')
        setNameError(null)
      }
      return registered
    },
    [register]
  )

  const handleRegister = useCallback(async () => {
    if (!supported) {
      toast.info(t('This device does not support Passkey'))
      return
    }
    if (credentials.length >= MAX_PASSKEYS_PER_USER) {
      toast.info(
        t('You can register up to {{count}} Passkeys.', {
          count: MAX_PASSKEYS_PER_USER,
        })
      )
      return
    }
    const validationError = validatePasskeyName(displayName, credentials)
    setNameError(validationError)
    if (validationError) return

    const name = displayName.trim()
    const methods = await fetchVerificationMethods()
    if (credentials.length === 0 && !methods.has2FA) {
      await performRegistration(name)
      return
    }

    const requiredMethod: VerificationMethod = methods.has2FA
      ? '2fa'
      : 'passkey'
    if (requiredMethod === 'passkey' && !methods.passkeySupported) {
      toast.info(t('This device does not support Passkey'))
      return
    }

    setNameDialogOpen(false)
    setRestrictedMethod(requiredMethod)
    await startVerification(
      (proofToken) => performRegistration(name, proofToken),
      {
        scope: 'passkey.register',
        preferredMethod: requiredMethod,
        title: t('Security verification'),
        description: t(
          'Confirm your identity before adding a Passkey to your account.'
        ),
      }
    )
  }, [
    credentials,
    displayName,
    fetchVerificationMethods,
    performRegistration,
    startVerification,
    supported,
    t,
  ])

  const handleRemove = useCallback(async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const methods = await fetchVerificationMethods()
    let requiredMethod: VerificationMethod | null = null
    if (methods.has2FA) {
      requiredMethod = '2fa'
    } else if (methods.hasPasskey) {
      requiredMethod = 'passkey'
    }
    if (!requiredMethod) {
      toast.error(
        t(
          'Please enable Two-factor Authentication or Passkey before proceeding'
        )
      )
      return
    }
    if (requiredMethod === 'passkey' && !methods.passkeySupported) {
      toast.info(t('This device does not support Passkey'))
      return
    }

    setDeleteTarget(null)
    setRestrictedMethod(requiredMethod)
    await startVerification(
      async (proofToken) => {
        const removed = await remove(target.id, proofToken)
        if (removed) setDeleteTarget(null)
        return removed
      },
      {
        scope: 'passkey.delete',
        preferredMethod: requiredMethod,
        title: t('Security verification'),
        description: t(
          'Confirm your identity before removing this Passkey from your account.'
        ),
      }
    )
  }, [deleteTarget, fetchVerificationMethods, remove, startVerification, t])

  const handleVerificationCancel = useCallback(() => {
    setRestrictedMethod(null)
    cancelVerification()
  }, [cancelVerification])

  const handleDialogVerify = useCallback(
    async (method: VerificationMethod, code?: string) => {
      try {
        await executeVerification(method, code)
      } catch {
        // Errors are surfaced by useSecureVerification.
      }
    },
    [executeVerification]
  )

  if (pageLoading || loading) {
    return (
      <Card data-card-hover='false'>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='mt-2 h-4 w-64' />
        </CardHeader>
        <CardContent className='space-y-3'>
          <Skeleton className='h-20 w-full' />
          <Skeleton className='h-20 w-full' />
        </CardContent>
      </Card>
    )
  }

  const formattedLastUsed = formatRelativeDate(lastUsed, t('Not used yet'))
  const atLimit = credentials.length >= MAX_PASSKEYS_PER_USER

  return (
    <>
      <Card data-card-hover='false'>
        <CardHeader>
          <CardTitle>{t('Passkey Login')}</CardTitle>
          <CardDescription>
            {t('Use Passkey to sign in without entering your password.')}
          </CardDescription>
          <CardAction>
            <Button
              type='button'
              size='sm'
              disabled={!supported || registering || atLimit}
              onClick={() => setNameDialogOpen(true)}
            >
              {registering ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Plus className='h-4 w-4' />
              )}
              {t('Add Passkey')}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className='space-y-5'>
          <div className='flex items-start gap-4'>
            <IconBadge tone='info' size='sm'>
              <KeyRound />
            </IconBadge>
            <div className='min-w-0 flex-1 space-y-1'>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='font-medium'>{t('Passkey Authentication')}</p>
                <StatusBadge
                  label={enabled ? t('Enabled') : t('Disabled')}
                  variant={enabled ? 'success' : 'neutral'}
                  showDot
                  copyable={false}
                />
              </div>
              <p className='text-muted-foreground text-sm'>
                {t('{{count}} of {{maximum}} registered', {
                  count: credentials.length,
                  maximum: MAX_PASSKEYS_PER_USER,
                })}
                {' · '}
                {t('Last used:')} {formattedLastUsed}
              </p>
            </div>
          </div>

          {credentials.length === 0 ? (
            <div className='bg-muted/40 rounded-lg border border-dashed p-5 text-center'>
              <p className='font-medium'>{t('No Passkeys registered')}</p>
              <p className='text-muted-foreground mt-1 text-sm'>
                {t(
                  'Add a Passkey to sign in and verify sensitive actions from another device.'
                )}
              </p>
            </div>
          ) : (
            <div className='rounded-lg border'>
              {credentials.map((credential, index) => {
                let backupLabel = t('No backup')
                let backupVariant: 'neutral' | 'warning' | 'success' = 'neutral'
                if (credential.backup_eligible) {
                  backupLabel = credential.backup_state
                    ? t('Backed up')
                    : t('Not backed up')
                  backupVariant = credential.backup_state
                    ? 'success'
                    : 'warning'
                }
                return (
                  <div key={credential.id}>
                    {index > 0 && <Separator />}
                    <div className='flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='min-w-0 space-y-2'>
                        <div className='flex flex-wrap items-center gap-2'>
                          <p className='truncate font-medium'>
                            {credential.display_name}
                          </p>
                          <StatusBadge
                            label={backupLabel}
                            variant={backupVariant}
                            copyable={false}
                          />
                          {credential.attachment === 'platform' && (
                            <StatusBadge
                              label={t('Platform')}
                              variant='neutral'
                              copyable={false}
                            />
                          )}
                        </div>
                        <p className='text-muted-foreground text-xs'>
                          {t('Created:')}{' '}
                          {formatRelativeDate(
                            credential.created_at,
                            credential.created_at
                          )}
                          {' · '}
                          {t('Last used:')}{' '}
                          {formatRelativeDate(
                            credential.last_used_at,
                            t('Not used yet')
                          )}
                        </p>
                      </div>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='text-destructive hover:text-destructive self-start sm:self-auto'
                        disabled={removingId === credential.id}
                        onClick={() => setDeleteTarget(credential)}
                      >
                        {removingId === credential.id ? (
                          <Loader2 className='h-4 w-4 animate-spin' />
                        ) : (
                          <Trash2 className='h-4 w-4' />
                        )}
                        {t('Remove')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!supported && !enabled && (
            <div className='bg-muted/60 text-muted-foreground flex items-start gap-3 rounded-md p-4 text-sm'>
              <ShieldAlert className='mt-0.5 h-4 w-4 shrink-0 text-amber-500' />
              <div>
                <p className='text-foreground font-medium'>
                  {t('Passkey not supported on this device')}
                </p>
                <p>
                  {t(
                    'Use a compatible browser or device with biometric authentication or a security key to register a Passkey.'
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={nameDialogOpen}
        onOpenChange={(next) => {
          setNameDialogOpen(next)
          if (!next) setNameError(null)
        }}
        title={t('Name this Passkey')}
        description={t(
          'Use a recognizable name such as “Work laptop” or “Phone”.'
        )}
        contentClassName='sm:max-w-md'
        footer={
          <>
            <Button
              type='button'
              variant='outline'
              onClick={() => setNameDialogOpen(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='button'
              disabled={registering}
              onClick={handleRegister}
            >
              {registering && <Loader2 className='h-4 w-4 animate-spin' />}
              {t('Add Passkey')}
            </Button>
          </>
        }
      >
        <div className='space-y-2'>
          <Label htmlFor='passkey-display-name'>{t('Passkey name')}</Label>
          <Input
            id='passkey-display-name'
            value={displayName}
            maxLength={MAX_PASSKEY_NAME_LENGTH}
            placeholder={t('Work laptop')}
            aria-invalid={Boolean(validationMessage)}
            aria-describedby={
              validationMessage ? 'passkey-name-error' : undefined
            }
            onChange={(event) => {
              setDisplayName(event.target.value)
              if (nameError) setNameError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !registering) {
                event.preventDefault()
                void handleRegister()
              }
            }}
          />
          {validationMessage && (
            <p id='passkey-name-error' className='text-destructive text-sm'>
              {validationMessage}
            </p>
          )}
        </div>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => !next && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('Remove {{name}}?', {
                name: deleteTarget?.display_name ?? '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'Remove this Passkey from your account. Your other Passkeys will continue to work.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={(event) => {
                event.preventDefault()
                void handleRemove()
              }}
            >
              {t('Remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SecureVerificationDialog
        open={verificationOpen}
        onOpenChange={(next) => {
          if (!next) setRestrictedMethod(null)
          setVerificationOpen(next)
        }}
        methods={dialogMethods}
        state={verificationState}
        onVerify={handleDialogVerify}
        onCancel={handleVerificationCancel}
        onCodeChange={setCode}
        onMethodChange={switchMethod}
      />
    </>
  )
}
