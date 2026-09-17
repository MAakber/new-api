import { createFileRoute } from '@tanstack/react-router'

import { CompleteRegistration } from '@/features/auth/complete-registration'

export const Route = createFileRoute('/(auth)/complete-registration')({
  component: CompleteRegistration,
})
