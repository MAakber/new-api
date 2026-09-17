import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { UpstreamRatioSync } from '@/features/system-settings/models/upstream-ratio-sync'

export function PriceSyncDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Sync model pricing')}
      description={t('Compare prices and choose a source for each model.')}
      contentClassName='sm:max-w-6xl'
      contentHeight='min(75vh, 800px)'
      bodyClassName='h-full'
    >
      {props.open && <UpstreamRatioSync />}
    </Dialog>
  )
}
