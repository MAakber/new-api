import { ReactFlowProvider } from '@xyflow/react'

import { useAuthStore } from '@/stores/auth-store'

import { DrawingWorkspace } from './components/DrawingWorkspace'

export function Drawing() {
  const userId = useAuthStore((state) => state.auth.user?.id)
  if (!userId) return null
  return (
    <ReactFlowProvider key={userId}>
      <DrawingWorkspace userId={userId} />
    </ReactFlowProvider>
  )
}
