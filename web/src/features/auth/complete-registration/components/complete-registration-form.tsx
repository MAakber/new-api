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
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { completeRegistration } from '@/features/auth/api'
import { registrationCodeFormSchema } from '@/features/auth/constants'
import { useAuthRedirect } from '@/features/auth/hooks/use-auth-redirect'
import { isAuthBundle } from '@/lib/api'
import { getServerErrorMessageKey } from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

export function CompleteRegistrationForm() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const pendingFlowToken = useAuthStore(
    (state) => state.auth.pendingRegistrationFlowToken
  )
  const setPendingFlowToken = useAuthStore(
    (state) => state.auth.setPendingRegistrationFlowToken
  )
  const { handleLoginSuccess, redirectToLogin, redirectToRegister } =
    useAuthRedirect()
  const form = useForm<z.infer<typeof registrationCodeFormSchema>>({
    resolver: zodResolver(registrationCodeFormSchema),
    defaultValues: { registrationCode: '' },
  })

  async function onSubmit(
    data: z.infer<typeof registrationCodeFormSchema>
  ): Promise<void> {
    if (!pendingFlowToken) {
      toast.error(t('Registration flow expired. Please try again.'))
      redirectToRegister()
      return
    }

    setIsLoading(true)
    try {
      const response = await completeRegistration({
        flow_token: pendingFlowToken,
        registration_code: data.registrationCode,
      })
      if (!response.success) {
        const messageKey = getServerErrorMessageKey(response)
        if (messageKey === 'Registration flow expired. Please try again.') {
          setPendingFlowToken(null)
          toast.error(t(messageKey))
          redirectToRegister()
          return
        }
        toast.error(messageKey ? t(messageKey) : response.message)
        return
      }

      setPendingFlowToken(null)
      if (isAuthBundle(response.data)) {
        await handleLoginSuccess(response.data)
        toast.success(t('Account created successfully'))
        return
      }
      toast.success(t('Account created! Please sign in'))
      redirectToLogin()
    } catch (error: unknown) {
      const messageKey = getServerErrorMessageKey(error)
      if (messageKey) {
        if (messageKey === 'Registration flow expired. Please try again.') {
          setPendingFlowToken(null)
          redirectToRegister()
        }
        return
      }
      toast.error(t('Failed to create account'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-4'>
        <FormField
          control={form.control}
          name='registrationCode'
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('Registration Code')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('Enter your registration code')}
                  autoComplete='one-time-code'
                  autoFocus
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type='submit' disabled={isLoading} className='w-full gap-2'>
          {isLoading && <Loader2 className='h-4 w-4 animate-spin' />}
          {t('Complete registration')}
        </Button>
      </form>
    </Form>
  )
}
