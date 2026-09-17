import { createFileRoute, redirect } from '@tanstack/react-router'

import { TaskPlugins } from '@/features/task-plugins'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/task-plugins/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (auth.user?.role !== ROLE.SUPER_ADMIN) throw redirect({ to: '/403' })
  },
  component: TaskPlugins,
})
