import React, { useState } from 'react'

import {
  getOptionValue,
  useSystemOptions,
} from '@/features/system-settings/hooks/use-system-options'
import useDialogState from '@/hooks/use-dialog'

import type { PlanRecord, SubscriptionsDialogType } from '../types'

const CURRENT_COMPLIANCE_TERMS_VERSION = 'v1'

type SubscriptionsContextType = {
  open: SubscriptionsDialogType | null
  setOpen: (str: SubscriptionsDialogType | null) => void
  currentRow: PlanRecord | null
  setCurrentRow: React.Dispatch<React.SetStateAction<PlanRecord | null>>
  refreshTrigger: number
  triggerRefresh: () => void
  complianceConfirmed: boolean
}

const SubscriptionsContext =
  React.createContext<SubscriptionsContextType | null>(null)

export function SubscriptionsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [open, setOpen] = useDialogState<SubscriptionsDialogType>(null)
  const [currentRow, setCurrentRow] = useState<PlanRecord | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const { data } = useSystemOptions()
  const complianceOptions = getOptionValue(data?.data, {
    'payment_setting.compliance_confirmed': false,
    'payment_setting.compliance_terms_version': '',
  })
  const complianceConfirmed =
    complianceOptions['payment_setting.compliance_confirmed'] &&
    complianceOptions['payment_setting.compliance_terms_version'] ===
      CURRENT_COMPLIANCE_TERMS_VERSION

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1)

  return (
    <SubscriptionsContext
      value={{
        open,
        setOpen,
        currentRow,
        setCurrentRow,
        refreshTrigger,
        triggerRefresh,
        complianceConfirmed,
      }}
    >
      {children}
    </SubscriptionsContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useSubscriptions = () => {
  const ctx = React.useContext(SubscriptionsContext)
  if (!ctx) {
    throw new Error(
      'useSubscriptions has to be used within <SubscriptionsProvider>'
    )
  }
  return ctx
}
