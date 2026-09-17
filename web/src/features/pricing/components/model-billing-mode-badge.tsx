import { useTranslation } from 'react-i18next'

import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import { cn } from '@/lib/utils'

import { getBillingModeLabelKey } from '../lib/billing-mode'
import { isDynamicPricingModel } from '../lib/dynamic-price'
import type { PricingModel } from '../types'

interface ModelBillingModeBadgeProps {
  model: PricingModel
  appearance?: 'default' | 'caption'
  className?: string
}

export function ModelBillingModeBadge(props: ModelBillingModeBadgeProps) {
  const { t } = useTranslation()
  const labelKey = getBillingModeLabelKey(props.model)
  const label = t(labelKey)
  const isCaption = props.appearance === 'caption'
  let variant: StatusVariant = 'purple'

  if (isDynamicPricingModel(props.model)) {
    variant = 'warning'
  } else if (labelKey === 'Token-based') {
    variant = 'info'
  }

  return (
    <StatusBadge
      label={label}
      variant={variant}
      type={isCaption ? 'text' : undefined}
      copyable={false}
      size='sm'
      className={cn(isCaption && 'text-xs font-normal', props.className)}
    />
  )
}
