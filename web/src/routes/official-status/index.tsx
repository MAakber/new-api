import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { OfficialStatus } from '@/features/official-status'
import { getModuleAccessForGuard } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/official-status/')({
  validateSearch: z.object({
    days: z.coerce
      .number()
      .pipe(z.union([z.literal(30), z.literal(90)]))
      .optional()
      .catch(undefined),
  }),
  beforeLoad: async ({ context, location }) => {
    const access = await getModuleAccessForGuard(
      context.queryClient,
      'official_status'
    )
    if (!access.enabled) throw redirect({ to: '/' })
    if (access.requireAuth && !useAuthStore.getState().auth.user) {
      throw redirect({ to: '/sign-in', search: { redirect: location.href } })
    }
  },
  component: OfficialStatus,
})
