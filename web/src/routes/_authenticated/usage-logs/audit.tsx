import { createFileRoute } from '@tanstack/react-router'

import { AuditLogs } from '@/features/usage-logs/audit'

export const Route = createFileRoute('/_authenticated/usage-logs/audit')({
  component: AuditLogs,
})
