import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated/playground/')({
  beforeLoad: () => {
    throw redirect({ to: '/playground/chat', replace: true })
  },
})
