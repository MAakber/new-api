import { createFileRoute } from '@tanstack/react-router'

import { Security } from '@/features/security'

export const Route = createFileRoute('/_authenticated/security/')({
  component: Security,
})
