import { createFileRoute } from '@tanstack/react-router'

import { Drawing } from '@/features/playground/drawing'

export const Route = createFileRoute('/_authenticated/playground/drawing')({
  component: Drawing,
})
